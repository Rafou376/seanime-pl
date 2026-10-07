/// <reference path="../../_shared/onlinestream/online-streaming-provider.d.ts" />
import { extract, extractorNames, hasExtractor } from "../../_shared/onlinestream/extractors";
import { emptyServer, episodeServerList, resolveEpisodeServer } from "../../_shared/onlinestream/provider-helpers";
import { decodeEntities } from "../../_shared/utils/html";
import { fetchForm, fetchJson, parseJson } from "../../_shared/utils/http";

const baseUrl = "https://french-stream.net";

const IGNORED_SERVERS = new Set(["premium"]);
const NON_VERSION_KEYS = new Set(["info"]);

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

function episodeVersions(data: EpisodesData): [string, EpisodesData[string]][] {
    return Object.entries(data).filter(([key]) => !NON_VERSION_KEYS.has(key));
}

export class Provider {
    private readonly episodesCache = new Map<string, Promise<EpisodesData | null>>();

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
            subOrDub: "both",
        }));
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const json = await this.fetchEpisodesData(id);
        if (!json) return [];

        const episodeNumbers = new Set(episodeVersions(json).flatMap(([, episodes]) => Object.keys(episodes ?? {})));

        if (episodeNumbers.size === 0) {
            const episodeId = JSON.stringify({ id, type: "movie" });
            return [{ id: episodeId, number: 1, url: episodeId, title: "Film" }];
        }

        const episodes = new Map<number, string>();

        for (const num of episodeNumbers) {
            const number = parseFloat(num);
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
        if (!episodeInfo) return emptyServer(server);

        const serversMap = episodeInfo.type === "tv"
            ? await this.getTvServers(episodeInfo)
            : await this.getMovieServers(episodeInfo);

        return resolveEpisodeServer(serversMap, server, (name, entry) => extract(name, entry.url, entry.version.toUpperCase()), hasExtractor);
    }

    private fetchEpisodesData(id: string): Promise<EpisodesData | null> {
        const request: Promise<EpisodesData | null> = fetchJson<EpisodesData>(`${baseUrl}/ep-data.php?id=${id}`).then((json) => {
            if (!json && this.episodesCache.get(id) === request) this.episodesCache.delete(id);
            return json;
        });

        this.episodesCache.set(id, request);
        return request;
    }

    private async getTvServers(episodeInfo: TvEpisodeId): Promise<ServersMap> {
        const json = (await (this.episodesCache.get(episodeInfo.id) ?? this.fetchEpisodesData(episodeInfo.id))) ?? {};
        const map: ServersMap = {};

        for (const [version, episodes] of episodeVersions(json)) {
            const servers = episodes?.[episodeInfo.num] ?? {};

            for (const [name, url] of Object.entries(servers)) {
                if (IGNORED_SERVERS.has(name) || !url) continue;
                (map[name] ??= []).push({ url, version });
            }
        }

        return map;
    }

    private async getMovieServers(episodeInfo: MovieEpisodeId): Promise<ServersMap> {
        const json = await fetchJson<FilmData>(`${baseUrl}/engine/ajax/film_api.php?id=${episodeInfo.id}`);
        const map: ServersMap = {};

        for (const [name, versions] of Object.entries(json?.players ?? {})) {
            if (IGNORED_SERVERS.has(name)) continue;

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
