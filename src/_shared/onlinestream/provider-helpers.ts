type CollectedSources = {
    headers: { [key: string]: string };
    videoSources: VideoSource[];
};

type ExtractFn<T> = (serverName: string, entry: T) => Promise<ExtractorResult>;

export function noSources(): ExtractorResult {
    return { sources: [] };
}

export function emptyServer(server: string): EpisodeServer {
    return { server, headers: {}, videoSources: [] };
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export function episodeServerList(names: string[]): string[] {
    return names.map(capitalize);
}

function pickServer(availableServers: string[], server: string): string | undefined {
    const wanted = server.toLowerCase();
    const byName = availableServers.find((name) => name.toLowerCase().includes(wanted));
    if (byName) return byName;

    const legacy = /^server\s*(\d+)$/i.exec(server);
    return legacy?.[1] ? availableServers[parseInt(legacy[1], 10) - 1] : undefined;
}

async function collectSources<T>(serverName: string, entries: T[], extract: ExtractFn<T>): Promise<CollectedSources> {
    const results = await Promise.all(
        entries.map((entry) => extract(serverName, entry).catch(noSources)),
    );

    const videoSources: VideoSource[] = [];
    const headers: { [key: string]: string } = {};

    for (const result of results) {
        videoSources.push(...result.sources);
        Object.assign(headers, result.headers);
    }

    return { headers, videoSources };
}

export async function resolveEpisodeServer<T>(
    serversMap: Record<string, T[]>,
    server: string,
    extract: ExtractFn<T>,
    isSupported: (serverName: string) => boolean = () => true,
): Promise<EpisodeServer> {
    const availableServers = Object.keys(serversMap).sort();
    const picked = server === "default" ? undefined : pickServer(availableServers, server);
    const ordered = picked === undefined ? availableServers : [picked, ...availableServers.filter((name) => name !== picked)];
    const candidates = ordered.filter(isSupported);

    for (const name of candidates) {
        const collected = await collectSources(name, serversMap[name] ?? [], extract);
        if (collected.videoSources.length > 0) return { server: name, ...collected };
    }

    return emptyServer(candidates[0] ?? server);
}
