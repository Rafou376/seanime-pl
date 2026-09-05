/// <reference path="../../_shared/onlinestream/online-streaming-provider.d.ts" />
import { extract } from "../../_shared/onlinestream/extractors";

const baseUrl = "https://french-stream.one";

class Provider {
    private static readonly MAX_SERVERS = 10;

    getSettings(): Settings {
        return {
            episodeServers: Array.from({ length: Provider.MAX_SERVERS }, (_, i) => `Server ${i + 1}`),
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
        const episodeInfo = JSON.parse(episode.id);
        const serversMap = episodeInfo.type === "tv"
            ? await this.getTvServers(episodeInfo)
            : await this.getMovieServers(episodeInfo);

        const availableServers = Object.keys(serversMap).sort();
        const index = server === "default" ? 0 : parseInt(server.replace(/\D/g, ""), 10) - 1;
        const selectedServer = availableServers[index];

        const videoSources: VideoSource[] = [];
        let headers: { [key: string]: string } = {};

        if (selectedServer) {
            const results = await Promise.all(
                serversMap[selectedServer]
                    .filter((entry) => entry.url)
                    .map((entry) => extract(selectedServer, entry.url, entry.version.toUpperCase())),
            );

            for (const result of results) {
                videoSources.push(...result.sources);
                if (result.headers) headers = { ...headers, ...result.headers };
            }
        }

        return { server: selectedServer ?? server, headers, videoSources };
    }

    private async getTvServers(episodeInfo: any): Promise<Record<string, { url: string; version: string }[]>> {
        const json = (await this.fetchJson(`${baseUrl}/ep-data.php?id=${episodeInfo.id}`)) ?? {};
        const map: Record<string, { url: string; version: string }[]> = {};

        for (const version of Object.keys(json)) {
            const servers = json[version]?.[episodeInfo.num] ?? {};

            for (const [name, url] of Object.entries(servers)) {
                if (name === "premium") continue;
                (map[name] ??= []).push({ url: url as string, version });
            }
        }

        return map;
    }

    private async getMovieServers(episodeInfo: any): Promise<Record<string, { url: string; version: string }[]>> {
        const json = (await this.fetchJson(`${baseUrl}/engine/ajax/film_api.php?id=${episodeInfo.id}`)) ?? {};
        const players = json.players ?? {};
        const map: Record<string, { url: string; version: string }[]> = {};

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
