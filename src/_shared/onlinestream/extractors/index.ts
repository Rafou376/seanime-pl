import { EXTRACTORS } from "virtual:extractors-map";
import { fetchResponse } from "../../utils/http";
import { noSources } from "../provider-helpers";

const EXTRACTOR_MAP = new Map(Object.entries(EXTRACTORS));
const EXTRACTOR_KEYS = [...EXTRACTOR_MAP.keys()].sort((a, b) => b.length - a.length);

export function extractorNames(): string[] {
    return [...EXTRACTOR_MAP.keys()];
}

function findExtractor(serverName: string): Extractor | undefined {
    const name = serverName.toLowerCase();
    const key = EXTRACTOR_MAP.has(name) ? name : EXTRACTOR_KEYS.find((candidate) => name.includes(candidate));

    return key === undefined ? undefined : EXTRACTOR_MAP.get(key);
}

export function hasExtractor(serverName: string): boolean {
    return findExtractor(serverName) !== undefined;
}

async function isReachable(url: string, headers: Record<string, string>): Promise<boolean> {
    if (await fetchResponse(url, { method: "HEAD", headers })) return true;

    return (await fetchResponse(url, { method: "GET", headers: { ...headers, Range: "bytes=0-0" } })) !== null;
}

export async function extract(serverName: string, playerUrl: string, label: string): Promise<ExtractorResult> {
    const extractor = findExtractor(serverName);
    if (!extractor) return noSources();

    const result = await extractor(playerUrl, label);
    const headers = result.headers ?? {};
    const reachable = await Promise.all(result.sources.map((source) => isReachable(source.url, headers)));

    return { ...result, sources: result.sources.filter((_, index) => reachable[index]) };
}
