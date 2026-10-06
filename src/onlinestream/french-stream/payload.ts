/// <reference path="../../_shared/onlinestream/online-streaming-provider.d.ts" />
import { extract, extractorNames, hasExtractor } from "../../_shared/onlinestream/extractors";
import { episodeServerList, resolveEpisodeServer } from "../../_shared/onlinestream/provider-helpers";
import { decodeEntities } from "../../_shared/utils/html";
import { fetchForm, fetchJson, parseJson } from "../../_shared/utils/http";

const baseUrl = "https://french-stream.net";

const SEARCH_RE = /location\.href='\/(\d+)-([^']+?)\.html'(?:(?!location\.href=)[\s\S])*?<div class='search-title'>([^<]+)<\/div>/g;

type MovieEpisodeId = {
    id: string;
    type: "movie";
};

type TvEpisodeId = {
    id: string;
    type: "tv";
    num: string;
};

type EpisodeId = MovieEpisodeId | TvEpisodeId;

type ServerEntry = {
    url: string;
    version: string;
};

type ServersMap = Record<string, ServerEntry[]>;

type EpisodesData = Record<string, Record<string, Record<string, string | null>>>;

type FilmData = {
    players?: Record<string, Record<string, string>>;
};

export class Provider {
    getSettings(): Settings {
        return {
            episodeServers: episodeServerList(extractorNames()),
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const html = await fetchForm(`${baseUrl}/engine/ajax/search.php`, { query: opts.query, page: "1" });
        if (!html) return [];

        return [...html.matchAll(SEARCH_RE)].map(([, id = "", slug = "", title = ""]) => ({
            id,
            title: decodeEntities(title.trim()),
            url: `${baseUrl}/${id}-${slug}.html`,
            subOrDub: "both" as const,
        }));
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const json = await fetchJson<EpisodesData>(`${baseUrl}/ep-data.php?id=${id}`);
        if (!json) return [];

        const episodeNumbers = new Set([
            ...Object.keys(json.vf ?? {}),
            ...Object.keys(json.vostfr ?? {}),
            ...Object.keys(json.vo ?? {}),
        ]);

        if (episodeNumbers.size === 0) {
            const episodeId = JSON.stringify({ id, type: "movie" });
            return [{ id: episodeId, number: 1, url: episodeId, title: "Film" }];
        }

        const episodes = new Map<number, string>();

        for (const num of episodeNumbers) {
            const number = parseInt(num, 10);
            if (Number.isFinite(number) && !episodes.has(number)) episodes.set(number, num);
        }

        return [...episodes]
            .sort(([a], [b]) => a - b)
            .map(([number, num]) => {
                const episodeId = JSON.stringify({ id, type: "tv", num });
                return { id: episodeId, number, url: episodeId, title: `Episode ${num}` };
            });
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const episodeInfo = parseJson<EpisodeId>(episode.id);
        if (!episodeInfo) return { server, headers: {}, videoSources: [] };

        const serversMap = episodeInfo.type === "tv"
            ? await this.getTvServers(episodeInfo)
            : await this.getMovieServers(episodeInfo);

        return resolveEpisodeServer(serversMap, server, (name, entry) => extract(name, entry.url, entry.version.toUpperCase()), hasExtractor);
    }

    private async getTvServers(episodeInfo: TvEpisodeId): Promise<ServersMap> {
        const json = (await fetchJson<EpisodesData>(`${baseUrl}/ep-data.php?id=${episodeInfo.id}`)) ?? {};
        const map: ServersMap = {};

        for (const [version, episodes] of Object.entries(json)) {
            const servers = episodes?.[episodeInfo.num] ?? {};

            for (const [name, url] of Object.entries(servers)) {
                if (name === "premium" || !url) continue;
                (map[name] ??= []).push({ url, version });
            }
        }

        return map;
    }

    private async getMovieServers(episodeInfo: MovieEpisodeId): Promise<ServersMap> {
        const json = await fetchJson<FilmData>(`${baseUrl}/engine/ajax/film_api.php?id=${episodeInfo.id}`);
        const map: ServersMap = {};

        for (const [name, versions] of Object.entries(json?.players ?? {})) {
            if (name === "premium") continue;

            const entries = Object.entries(versions);

            for (const [version, url] of entries) {
                if (!url) continue;
                if (version === "default" && entries.some(([other, otherUrl]) => other !== "default" && otherUrl === url)) continue;

                (map[name] ??= []).push({ url, version: version === "default" ? "VO" : version });
            }
        }

        return map;
    }
}
