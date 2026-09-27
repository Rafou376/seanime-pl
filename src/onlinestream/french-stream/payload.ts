/// <reference path="../../_shared/onlinestream/online-streaming-provider.d.ts" />
import { extract } from "../../_shared/onlinestream/extractors";
import { episodeServerList, resolveEpisodeServer } from "../../_shared/onlinestream/provider-helpers";

const baseUrl = "https://french-stream.net";

type EpisodeId = {
    id: string;
    type: "movie"
} | {
    id: string;
    type: "tv";
    num: string
};

type ServerEntry = {
    url: string;
    version: string
};

export class Provider {
    private static readonly MAX_SERVERS = 10;

    getSettings(): Settings {
        return {
            episodeServers: episodeServerList(Provider.MAX_SERVERS),
            supportsDub: true,
        };
    }

    async search(opts: SearchOptions): Promise<SearchResult[]> {
        const formData = new URLSearchParams();

        formData.append("query", opts.query);
        formData.append("page", "1");

        const res = await fetch(`${baseUrl}/engine/ajax/search.php`, {
            method: "POST",
            body: formData,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        const html = await res.text();
        const regex = /location\.href='\/(\d+)-([^']+?)\.html'[\s\S]*?<div class='search-title'>([^<]+)<\/div>/g;

        return Array.from(html.matchAll(regex)).map(([, id, slug, title]) => ({
            id,
            title: title.trim(),
            url: `${baseUrl}/${id}-${slug}.html`,
            subOrDub: "both" as SubOrDub,
        }));
    }

    async findEpisodes(id: string): Promise<EpisodeDetails[]> {
        const json = await this.fetchJson(`${baseUrl}/ep-data.php?id=${id}`);

        const episodeNumbers = new Set<string>([
            ...Object.keys(json?.vf ?? {}),
            ...Object.keys(json?.vostfr ?? {}),
            ...Object.keys(json?.vo ?? {}),
        ]);

        if (episodeNumbers.size === 0) {
            const episodeId = JSON.stringify({ id, type: "movie" });
            return [{ id: episodeId, number: 1, url: episodeId, title: "Film" }];
        }

        return Array.from(episodeNumbers)
            .map((num) => {
                const episodeId = JSON.stringify({ id, type: "tv", num });
                return { id: episodeId, number: parseInt(num, 10), url: episodeId, title: `Episode ${num}` };
            })
            .sort((a, b) => a.number - b.number);
    }

    async findEpisodeServer(episode: EpisodeDetails, server: string): Promise<EpisodeServer> {
        const episodeInfo = JSON.parse(episode.id) as EpisodeId;
        const serversMap = episodeInfo.type === "tv"
            ? await this.getTvServers(episodeInfo)
            : await this.getMovieServers(episodeInfo);

        return resolveEpisodeServer(serversMap, server, (name, entry) => extract(name, entry.url, entry.version.toUpperCase()));
    }

    private async getTvServers(episodeInfo: EpisodeId & { type: "tv" }): Promise<Record<string, ServerEntry[]>> {
        const json = (await this.fetchJson(`${baseUrl}/ep-data.php?id=${episodeInfo.id}`)) ?? {};
        const map: Record<string, ServerEntry[]> = {};

        for (const version of Object.keys(json)) {
            const servers = json[version]?.[episodeInfo.num] ?? {};

            for (const [name, url] of Object.entries(servers)) {
                if (name === "premium" || !url) continue;
                (map[name] ??= []).push({ url: url as string, version });
            }
        }

        return map;
    }

    private async getMovieServers(episodeInfo: EpisodeId): Promise<Record<string, ServerEntry[]>> {
        const json = (await this.fetchJson(`${baseUrl}/engine/ajax/film_api.php?id=${episodeInfo.id}`)) ?? {};
        const players = json.players ?? {};
        const map: Record<string, ServerEntry[]> = {};

        for (const [name, versions] of Object.entries(players)) {
            if (name === "premium") continue;

            const versionMap = versions as Record<string, string>;

            for (const [version, url] of Object.entries(versionMap)) {
                if (!url) continue;
                if (version === "default" && Object.entries(versionMap).some(([v, u]) => v !== "default" && u === url)) continue;

                (map[name] ??= []).push({ url, version: version === "default" ? "VO" : version });
            }
        }

        return map;
    }

    private async fetchJson(url: string): Promise<any | null> {
        try {
            const res = await fetch(url);
            return JSON.parse(await res.text());
        } catch {
            return null;
        }
    }
}
