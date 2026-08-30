import type { Extractor, ExtractorResult } from "./types";
import { extractGeneric } from "./generic";
import { extractVidzy } from "./vidzy";

const EXTRACTORS: Record<string, Extractor> = {
    vidzy: extractVidzy,
};

export function extract(serverName: string, playerUrl: string, label: string): Promise<ExtractorResult> {
    const name = serverName.toLowerCase();
    const extractor = Object.entries(EXTRACTORS).find(([key]) => name.includes(key))?.[1];

    return (extractor ?? extractGeneric)(playerUrl, label);
}

export type { ExtractorResult } from "./types";
