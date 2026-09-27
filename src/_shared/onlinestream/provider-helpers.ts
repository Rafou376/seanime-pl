export function episodeServerList(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `Server ${i + 1}`);
}

export function pickServer(availableServers: string[], server: string): string | undefined {
    const index = server === "default" ? 0 : parseInt(server.replace(/\D/g, ""), 10) - 1;
    return availableServers[index];
}

export async function resolveEpisodeServer<T>(
    serversMap: Record<string, T[]>,
    server: string,
    extract: (serverName: string, entry: T) => Promise<ExtractorResult>,
): Promise<EpisodeServer> {
    const availableServers = Object.keys(serversMap).sort();
    const selectedServer = pickServer(availableServers, server);

    const videoSources: VideoSource[] = [];
    let headers: { [key: string]: string } = {};

    if (selectedServer) {
        const results = await Promise.all(serversMap[selectedServer].map((entry) => extract(selectedServer, entry)));

        for (const result of results) {
            videoSources.push(...result.sources);
            if (result.headers) headers = { ...headers, ...result.headers };
        }
    }

    return { server: selectedServer ?? server, headers, videoSources };
}
