/// <reference path="../../_shared/onlinestream/online-streaming-provider.d.ts" />

import { WEBSITE } from "virtual:website";
import { createTtlCache } from "../../_shared/core/cache";
import { decodeEntities, getText, joinPieces, normalizeText, scriptContaining } from "../../_shared/core/html";
import { fetchForm, fetchJson, fetchText } from "../../_shared/core/http";
import { parseJson } from "../../_shared/core/json";
import { relativePath, trimLeadingSlashes } from "../../_shared/core/url";
import { extract, extractorNames, hasExtractor } from "../../_shared/onlinestream/extractors";
import { emptyServer, episodeServerList, noSources, resolveEpisodeServer } from "../../_shared/onlinestream/provider-helpers";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ANIME_META_RE = /\banime\b/i;
const JS_TOKEN_RE = /(["'])(?:\\.|(?!\1)[^\\\n])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
const EPS_ARRAY_RE = /(?:var|let|const)\s+eps\d+\s*=\s*\[((?:[^\]"']|"[^"]*"|'[^']*')*)\]/g;
const QUOTED_RE = /(["'])(.*?)\1/g;
const LECTEURS_RE = /lecteursInfos\s*=\s*(\{[\s\S]*?\})\s*;/;
const EPS_DECL_RE = /(?:var|let|const)\s+eps\d+\s*=\s*\[/;
const EPS_META_RE = /epsMeta\s*=\s*(\{[\s\S]*?\})\s*;/;
const EPS_TOKEN_RE = /epsJeton\s*=\s*(["'])(.*?)\1/;
const LINK_REF_RE = /^lien:(\d+)$/;
const WWW_RE = /^www\./;
const PANNEAU_CALL_RE = /^[ \t]*panneauAnime\(\s*(?:"([^"]*)"|'([^']*)')\s*,\s*(?:"([^"]*)"|'([^']*)')/gm;
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const EPISODE_RANGE_RE = /\[\s*[EÉ]pisodes?\s+(\d+)\s+[àa]\s+\d+\s*\]/i;
const LANGUES_RE = /languesDispo\s*=\s*(\[[^\]]*\])/;

type EpisodeId = {
    base: string;
    lang: string;
    index: number;
};

type LecteursInfos = Record<string, { nom?: string }>;

type SeasonLinks = {
    lists: string[][];
    meta: Record<string, string[]>;
    token: string;
};

type LinkEntry = {
    id: string;
    lang: string;
};

type SeasonPath = {
    base: string;
    lang: string;
    start: number;
};

function searchTitle(heading: DocSelection): string {
    let title = "";
    let markOnLeft = false;

    heading.contents().each((_, node) => {
        const text = node.text();
        if (!text) return;

        const isMark = node.is("mark");
        title = isMark === markOnLeft ? title + text : joinPieces(title, text, markOnLeft);
        markOnLeft = isMark;
    });

    return normalizeText(title);
}

function resolveUrl(path: string, base: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("//")) return `https:${path}`;
    if (path.startsWith("/")) return `${WEBSITE}${path}`;

    return `${base.slice(0, base.lastIndexOf("/") + 1)}${path.replace(/^\.\//, "")}`;
}

function splitSeasonPath(path: string): SeasonPath | null {
    const [rawPath = "", rawStart = ""] = path.split("#");
    const segments = trimLeadingSlashes(rawPath).split("/").filter(Boolean);
    const lang = segments.pop();
    const start = Number.parseInt(rawStart, 10);

    return lang && segments.length > 0 ? { base: segments.join("/"), lang, start: start >= 1 ? start : 1 } : null;
}

function parseEpisodeStart(name: string | null): number {
    const start = Number.parseInt(EPISODE_RANGE_RE.exec(name ?? "")?.[1] ?? "", 10);

    return start >= 1 ? start : 1;
}

function pageUrl(base: string, lang: string): string {
    return `${WEBSITE}/${base}/${lang}/`;
}

function serverNameFor(host: string, lecteurs: LecteursInfos): string {
    const name = host.toLowerCase();

    return (lecteurs[name] ?? lecteurs[name.replace(WWW_RE, "")])?.nom ?? name;
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

function parseSeasonLinks(html: string): SeasonLinks | null {
    const script = scriptContaining(html, EPS_DECL_RE);
    const token = script ? EPS_TOKEN_RE.exec(script)?.[2] : undefined;
    if (!script || !token) return null;

    const source = script.replace(JS_TOKEN_RE, (match) => (match.startsWith("/") ? "" : match));
    const lists = [...source.matchAll(EPS_ARRAY_RE)].map(([, body = ""]) => [...body.matchAll(QUOTED_RE)].map(([, , ref = ""]) => LINK_REF_RE.exec(ref)?.[1] ?? ""));
    const meta = parseJson<Record<string, string[]>>(EPS_META_RE.exec(script)?.[1] ?? "") ?? {};

    return { lists, meta, token };
}

export class Provider implements AnimeProvider {
    private readonly cachePage = createTtlCache<string>(CACHE_TTL_MS);
    private readonly cacheLang = createTtlCache<SeasonLinks>(CACHE_TTL_MS);

    getSettings(): Settings {
        return {
            episodeServers: episodeServerList(extractorNames()),
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const html = await fetchForm(`${WEBSITE}/template-php/defaut/fetch.php`, { query: opts.query });
        if (!html) return [];

        const animes: { url: string; title: string }[] = [];

        LoadDoc(html)("a.asn-search-result").each((_, block) => {
            const href = block.attr("href");
            const meta = getText(block.find("p.asn-search-meta").first());
            const title = searchTitle(block.find("h3.asn-search-result-title").first());

            if (!href || !title || !ANIME_META_RE.test(meta)) return;

            animes.push({ url: resolveUrl(href, `${WEBSITE}/`), title });
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

        const links = await this.loadLang(season.base, season.lang);
        const count = Math.max(0, ...(links?.lists ?? []).map((list) => list.length));

        return Array.from({ length: count }, (_, index) => {
            const number = season.start + index;
            const episodeId = JSON.stringify({ base: season.base, lang: season.lang, index } satisfies EpisodeId);
            return { id: episodeId, number, url: `${season.base}/${season.lang}`, title: `Episode ${number}` };
        });
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const episodeInfo = parseJson<EpisodeId>(episode.id);
        if (!episodeInfo) return emptyServer(server);

        const serversMap = await this.getServers(episodeInfo);

        return resolveEpisodeServer(
            serversMap,
            server,
            async (name, { id, lang }) => {
                const url = await this.resolveLink(episodeInfo.base, lang, id);

                return url ? extract(name, url, lang.toUpperCase()) : noSources();
            },
            hasExtractor,
        );
    }

    private fetchPage(url: string): Promise<string | null> {
        return this.cachePage(url, () => fetchText(url));
    }

    private async findSeasons(catalogueUrl: string, title: string): Promise<SearchResult[]> {
        const html = await this.fetchPage(catalogueUrl);
        if (!html) return [];

        const base = catalogueUrl.endsWith("/") ? catalogueUrl : `${catalogueUrl}/`;
        const panels: { href: string; name: string | null; start: number }[] = [];

        LoadDoc(html)("a.oe-panneau").each((_, block) => {
            const href = block.attr("href");
            if (!href || block.is(".oe-panneau-scan")) return;

            panels.push({ href, name: getText(block.find("span.oe-panneau-nom").first()) || null, start: 1 });
        });

        const entries = panels.length > 0
            ? panels
            : [...html.replace(BLOCK_COMMENT_RE, "").matchAll(PANNEAU_CALL_RE)].map((match) => {
                const name = decodeEntities(match[1] ?? match[2] ?? "").trim() || null;
                return { href: match[3] ?? match[4] ?? "", name, start: parseEpisodeStart(name) };
            });

        return entries.flatMap(({ href, name, start }) => {
            if (!href) return [];

            const url = resolveUrl(href, base);
            const path = relativePath(url);
            if (!splitSeasonPath(path)) return [];

            return [{
                id: start > 1 ? `${path}#${start}` : path,
                title: name ? `${title}: ${name}` : title,
                url,
                subOrDub: "both" as const,
            }];
        });
    }

    private async getServers(episodeInfo: EpisodeId): Promise<Record<string, LinkEntry[]>> {
        const firstHtml = await this.fetchPage(pageUrl(episodeInfo.base, episodeInfo.lang));
        if (!firstHtml) return {};

        const langs = parseAvailableLangs(firstHtml);
        const lecteurs = parseLecteurs(firstHtml);
        const seasons = await Promise.all(
            (langs.length > 0 ? langs : [episodeInfo.lang]).map(async (lang) => ({ lang, links: await this.loadLang(episodeInfo.base, lang) })),
        );

        const servers: Record<string, LinkEntry[]> = {};

        for (const { lang, links } of seasons) {
            for (const list of links?.lists ?? []) {
                const id = list[episodeInfo.index];
                const host = id ? links?.meta[id]?.[0] : undefined;

                if (id && host) (servers[serverNameFor(host, lecteurs)] ??= []).push({ id, lang });
            }
        }

        return servers;
    }

    private loadLang(base: string, lang: string): Promise<SeasonLinks | null> {
        return this.cacheLang(`${base}/${lang}`, async () => {
            const html = await this.fetchPage(pageUrl(base, lang));

            return html ? parseSeasonLinks(html) : null;
        });
    }

    private async resolveLink(base: string, lang: string, id: string): Promise<string | null> {
        const links = await this.loadLang(base, lang);
        if (!links) return null;

        const query = new URLSearchParams({ j: links.token, l: id }).toString();
        const data = await fetchJson<{ u?: string }>(`${WEBSITE}/api/lien.php?${query}`, { noCloudflareBypass: true });

        return data?.u ?? null;
    }
}
