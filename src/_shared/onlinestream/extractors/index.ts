import { EXTRACTORS } from "virtual:extractors-map";

export function extractorNames(): string[] {
    return Object.keys(EXTRACTORS);
}

async function isReachable(url: string, headers: Record<string, string>): Promise<boolean> {
    try {
        const res = await fetch(url, { method: "HEAD", headers });
        return res.ok;
    } catch {
        return false;
    }
}

export async function extract(serverName: string, playerUrl: string, label: string): Promise<ExtractorResult> {
    const name = serverName.toLowerCase();
    const extractor = Object.entries(EXTRACTORS).find(([key]) => name.includes(key))?.[1];

    if (!extractor) return { sources: [] };

    const result = await extractor(playerUrl, label);
    const headers = result.headers ?? {};
    const reachable = await Promise.all(result.sources.map((source) => isReachable(source.url, headers)));

    return { ...result, sources: result.sources.filter((_, index) => reachable[index]) };
}
