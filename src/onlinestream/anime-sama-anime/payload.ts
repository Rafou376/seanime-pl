/// <reference path="../../_shared/onlinestream/online-streaming-provider.d.ts" />

import { WEBSITE } from "virtual:website";
import { extract, extractorNames, hasExtractor } from "../../_shared/onlinestream/extractors";
import { emptyServer, episodeServerList, resolveEpisodeServer } from "../../_shared/onlinestream/provider-helpers";
import { classTokens, decodeEntities, getBlocksByClass, getTagAttr, getTextByClass, relativePath, scriptContaining, stripTags, trimLeadingSlashes } from "../../_shared/utils/html";
import { fetchForm, fetchText, parseJson } from "../../_shared/utils/http";
import { createTtlCache } from "../../_shared/utils/memo";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ANIME_META_RE = /\banime\b/i;
const EPISODES_SCRIPT_RE = /<script\b[^>]*\ssrc\s*=\s*(?:"([^"]*episodes\.js[^"]*)"|'([^']*episodes\.js[^']*)')/i;
const JS_TOKEN_RE = /(["'])(?:\\.|(?!\1)[^\\\n])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const EPS_ARRAY_RE = /(?:var|let|const)\s+eps\d+\s*=\s*\[((?:[^\]"']|"[^"]*"|'[^']*')*)\]/g;
const QUOTED_RE = /(["'])(.*?)\1/g;
const LECTEURS_RE = /lecteursInfos\s*=\s*(\{[\s\S]*?\})\s*;/;
const PANNEAU_CALL_RE = /^[ \t]*panneauAnime\(\s*(?:"([^"]*)"|'([^']*)')\s*,\s*(?:"([^"]*)"|'([^']*)')/gm;
const MARK_TAIL_RE = /(\p{L})<\/mark>\s+(\p{Ll})/gu;
const MARK_HEAD_RE = /(\p{L})\s+<mark>(\p{Ll})/gu;
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const LANGUES_RE = /languesDispo\s*=\s*(\[[^\]]*\])/;

type EpisodeId = {
    base: string;
    lang: string;
    index: number;
};

type ServerEntry = {
    url: string;
    lang: string;
};

type ServersMap = Record<string, ServerEntry[]>;

type LecteursInfos = Record<string, { nom?: string }>;

type SeasonPath = {
    base: string;
    lang: string;
};

function resolveUrl(path: string, base: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("//")) return `https:${path}`;
    if (path.startsWith("/")) return `${WEBSITE}${path}`;

    return `${base.slice(0, base.lastIndexOf("/") + 1)}${path.replace(/^\.\//, "")}`;
}

function splitSeasonPath(path: string): SeasonPath | null {
    const segments = trimLeadingSlashes(path).split("/").filter(Boolean);
    const lang = segments.pop();

    return lang && segments.length > 0 ? { base: segments.join("/"), lang } : null;
}

function pageUrl(base: string, lang: string): string {
    return `${WEBSITE}/${base}/${lang}/`;
}

function serverNameFor(url: string, lecteurs: LecteursInfos): string | null {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return (lecteurs[host] ?? lecteurs[host.replace(/^www\./, "")])?.nom ?? host;
    } catch {
        return null;
    }
}

function parseAvailableLangs(html: string): string[] {
    const script = scriptContaining(html, "languesDispo");
    const raw = script ? LANGUES_RE.exec(script)?.[1] : undefined;
    const langs = raw ? parseJson<unknown[]>(raw) : null;

    return (langs ?? []).filter((lang): lang is string => typeof lang === "string");
}

function parseLecteurs(html: string): LecteursInfos {
    const script = scriptContaining(html, "lecteursInfos");
    const raw = script ? LECTEURS_RE.exec(script)?.[1] : undefined;

    return (raw ? parseJson<LecteursInfos>(raw) : null) ?? {};
}

function parseEpisodeLists(js: string): string[][] {
    const source = js.replace(JS_TOKEN_RE, (token) => (token.startsWith("/") ? "" : token));

    return [...source.matchAll(EPS_ARRAY_RE)].map(([, body = ""]) => [...body.matchAll(QUOTED_RE)].map((match) => match[2] ?? ""));
}

export class Provider implements AnimeProvider {
    private readonly cachePage = createTtlCache<string>(CACHE_TTL_MS);
    private readonly cacheLang = createTtlCache<string[][]>(CACHE_TTL_MS);

    getSettings(): Settings {
        return {
            episodeServers: episodeServerList(extractorNames()),
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const html = await fetchForm(`${WEBSITE}/template-php/defaut/fetch.php`, { query: opts.query });
        if (!html) return [];

        const animes = getBlocksByClass(html, "asn-search-result", "a").flatMap((block) => {
            const href = getTagAttr(block, "href");
            const meta = getTextByClass(block, "asn-search-meta", "p") ?? "";
            const titleBlock = getBlocksByClass(block, "asn-search-result-title", "h3", 1)[0];
            const title = titleBlock ? stripTags(titleBlock.replace(MARK_TAIL_RE, "$1</mark>$2").replace(MARK_HEAD_RE, "$1<mark>$2"), "") : "";

            if (!href || !title || !ANIME_META_RE.test(meta)) return [];

            return [{ url: resolveUrl(href, `${WEBSITE}/`), title }];
        });

        const groups = await Promise.all(animes.map((anime) => this.findSeasons(anime.url, anime.title)));
        const seen = new Set<string>();

        return groups.flat().filter((result) => {
            if (seen.has(result.id)) return false;
            seen.add(result.id);
            return true;
        });
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const season = splitSeasonPath(id);
        if (!season) return [];

        const lists = await this.loadLang(season.base, season.lang);
        const count = Math.max(0, ...(lists ?? []).map((list) => list.length));

        return Array.from({ length: count }, (_, index) => {
            const number = index + 1;
            const episodeId = JSON.stringify({ base: season.base, lang: season.lang, index } satisfies EpisodeId);
            return { id: episodeId, number, url: `${season.base}/${season.lang}`, title: `Episode ${number}` };
        });
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const episodeInfo = parseJson<EpisodeId>(episode.id);
        if (!episodeInfo) return emptyServer(server);

        const serversMap = await this.getServers(episodeInfo);

        return resolveEpisodeServer(serversMap, server, (name, entry) => extract(name, entry.url, entry.lang.toUpperCase()), hasExtractor);
    }

    private fetchPage(url: string, referer?: string): Promise<string | null> {
        return this.cachePage(url, () => fetchText(url, referer ? { headers: { Referer: referer } } : undefined));
    }

    private async findSeasons(catalogueUrl: string, title: string): Promise<SearchResult[]> {
        const html = await this.fetchPage(catalogueUrl);
        if (!html) return [];

        const base = catalogueUrl.endsWith("/") ? catalogueUrl : `${catalogueUrl}/`;
        const panels = getBlocksByClass(html, "oe-panneau", "a").flatMap((block) => {
            const href = getTagAttr(block, "href");
            if (!href || classTokens(block).includes("oe-panneau-scan")) return [];

            return [{ href, name: getTextByClass(block, "oe-panneau-nom", "span") }];
        });

        const entries = panels.length > 0
            ? panels
            : [...html.replace(BLOCK_COMMENT_RE, "").matchAll(PANNEAU_CALL_RE)].map((match) => ({
                href: match[3] ?? match[4] ?? "",
                name: decodeEntities(match[1] ?? match[2] ?? "").trim() || null,
            }));

        return entries.flatMap(({ href, name }) => {
            if (!href) return [];

            const url = resolveUrl(href, base);
            const id = relativePath(url);
            if (!splitSeasonPath(id)) return [];

            return [{
                id,
                title: name ? `${title}: ${name}` : title,
                url,
                subOrDub: "both" as const,
            }];
        });
    }

    private async getServers(episodeInfo: EpisodeId): Promise<ServersMap> {
        const firstHtml = await this.fetchPage(pageUrl(episodeInfo.base, episodeInfo.lang));
        if (!firstHtml) return {};

        const langs = parseAvailableLangs(firstHtml);
        const lecteurs = parseLecteurs(firstHtml);
        const targets = langs.length > 0 ? langs : [episodeInfo.lang];

        const perLang = await Promise.all(targets.map((lang) => this.getLangServers(episodeInfo, lang, lecteurs)));
        const map: ServersMap = {};

        for (const [name, entry] of perLang.flat()) {
            (map[name] ??= []).push(entry);
        }

        return map;
    }

    private loadLang(base: string, lang: string): Promise<string[][] | null> {
        return this.cacheLang(`${base}/${lang}`, async () => {
            const url = pageUrl(base, lang);
            const html = await this.fetchPage(url);
            if (!html) return null;

            const scriptSrc = EPISODES_SCRIPT_RE.exec(html);
            const src = scriptSrc?.[1] ?? scriptSrc?.[2];
            if (!src) return null;

            const jsUrl = resolveUrl(decodeEntities(src), url);
            const js = await this.fetchPage(jsUrl, url);
            if (!js) return null;

            return parseEpisodeLists(js);
        });
    }

    private async getLangServers(episodeInfo: EpisodeId, lang: string, lecteurs: LecteursInfos): Promise<[string, ServerEntry][]> {
        const lists = await this.loadLang(episodeInfo.base, lang);

        return (lists ?? []).flatMap((list) => {
            const url = list[episodeInfo.index];
            const name = url ? serverNameFor(url, lecteurs) : null;
            return url && name ? [[name, { url, lang }] as [string, ServerEntry]] : [];
        });
    }
}
