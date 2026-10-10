import { EXTRACTORS } from "virtual:extractors-map";
import { fetchResponse } from "../../utils/http";
import { noSources } from "../provider-helpers";

const EXTRACTOR_KEYS = Object.keys(EXTRACTORS).sort((a, b) => b.length - a.length);

export function extractorNames(): string[] {
    return Object.keys(EXTRACTORS);
}

function findExtractor(serverName: string): Extractor | undefined {
    const name = serverName.toLowerCase();
    const exact = EXTRACTORS[name];
    if (exact) return exact;

    const key = EXTRACTOR_KEYS.find((candidate) => name.includes(candidate));

    return key === undefined ? undefined : EXTRACTORS[key];
}

export function hasExtractor(serverName: string): boolean {
    return findExtractor(serverName) !== undefined;
}

async function probe(url: string, init: RequestInit): Promise<boolean> {
    return (await fetchResponse(url, init)) !== null;
}

async function isReachable(url: string, headers: Record<string, string>): Promise<boolean> {
    return (await probe(url, { method: "HEAD", headers })) || probe(url, { method: "GET", headers: { ...headers, Range: "bytes=0-0" } });
}

export async function extract(serverName: string, playerUrl: string, label: string): Promise<ExtractorResult> {
    const extractor = findExtractor(serverName);
    if (!extractor) return noSources();

    const result = await extractor(playerUrl, label);
    const headers = result.headers ?? {};
    const reachable = await Promise.all(result.sources.map((source) => isReachable(source.url, headers)));

    return { ...result, sources: result.sources.filter((_, index) => reachable[index]) };
}
