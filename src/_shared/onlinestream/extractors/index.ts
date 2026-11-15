import { EXTRACTORS, EXTRACTOR_ALIASES } from "virtual:extractors-map";
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

export async function extract(serverName: string, playerUrl: string, label: string): Promise<ExtractorResult> {
    const extractor = findExtractor(serverName);
    return extractor ? extractor(playerUrl, label) : noSources();
}
