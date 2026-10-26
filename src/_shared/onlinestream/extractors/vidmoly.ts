import { absUrl } from "../../utils/html";
import { fetchText } from "../../utils/http";
import { noSources } from "../provider-helpers";

const M3U8_RE = /file\s*:\s*["']([^"']+?\.m3u8[^"']*)["']/;

export async function extractVidmoly(playerUrl: string, label: string): Promise<ExtractorResult> {
    let origin: string;
    try {
        origin = new URL(playerUrl).origin;
    } catch {
        return noSources();
    }

    const headers = { Referer: `${origin}/` };
    const html = await fetchText(playerUrl, { headers });
    if (!html) return noSources();

    const m3u8 = M3U8_RE.exec(html)?.[1];
    if (!m3u8) return noSources();

    return {
        sources: [{
            url: absUrl(m3u8, playerUrl),
            type: "m3u8",
            quality: `Auto - ${label}`,
            label,
            subtitles: [],
        }],
        headers,
    };
}
