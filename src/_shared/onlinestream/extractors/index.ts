import { EXTRACTORS, EXTRACTOR_ALIASES } from "virtual:extractors-map";
import { fetchResponse } from "../../utils/http";
import { noSources } from "../provider-helpers";

const EXTRACTOR_BY_NAME = new Map<string, Extractor>([
    ...Object.entries(EXTRACTORS),
    ...Object.entries(EXTRACTOR_ALIASES).flatMap(([alias, id]): [string, Extractor][] => (EXTRACTORS[id] ? [[alias, EXTRACTORS[id]]] : [])),
]);
const EXTRACTOR_NAMES = [...EXTRACTOR_BY_NAME.keys()].sort((a, b) => b.length - a.length);

export function extractorNames(): string[] {
    return Object.keys(EXTRACTORS);
}

function findExtractor(serverName: string): Extractor | undefined {
    const name = serverName.toLowerCase();
    const matched = EXTRACTOR_NAMES.find((candidate) => name.includes(candidate));

    return matched === undefined ? undefined : EXTRACTOR_BY_NAME.get(matched);
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
