import { EXTRACTORS } from "virtual:extractors-map";
import { noSources } from "../provider-helpers";

export function extractorNames(): string[] {
    return Object.keys(EXTRACTORS);
}

function findExtractor(serverName: string): Extractor | undefined {
    const name = serverName.toLowerCase();
    const exact = EXTRACTORS[name];
    if (exact) return exact;

    const key = Object.keys(EXTRACTORS)
        .filter((candidate) => name.includes(candidate))
        .sort((a, b) => b.length - a.length)[0];

    return key === undefined ? undefined : EXTRACTORS[key];
}

export function hasExtractor(serverName: string): boolean {
    return findExtractor(serverName) !== undefined;
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
    const extractor = findExtractor(serverName);
    if (!extractor) return noSources();

    const result = await extractor(playerUrl, label);
    const headers = result.headers ?? {};
    const reachable = await Promise.all(result.sources.map((source) => isReachable(source.url, headers)));

    return { ...result, sources: result.sources.filter((_, index) => reachable[index]) };
}
