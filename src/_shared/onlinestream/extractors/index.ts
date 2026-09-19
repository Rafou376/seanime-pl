import { EXTRACTORS } from "virtual:extractors-map";

export async function extract(serverName: string, playerUrl: string, label: string): Promise<ExtractorResult> {
    const name = serverName.toLowerCase();
    const extractor = Object.entries(EXTRACTORS).find(([key]) => name.includes(key))?.[1];

    if (!extractor) return { sources: [] };

    const result = await extractor(playerUrl, label);

    const sources = (
        await Promise.all(
            result.sources.map(async (source) => {
                try {
                    const res = await fetch(source.url, { method: "HEAD" });
                    return res.ok ? source : null;
                } catch {
                    return null;
                }
            }),
        )
    ).filter((source): source is VideoSource => source !== null);

    return { ...result, sources };
}
