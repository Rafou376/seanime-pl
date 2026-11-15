import { fetchText } from "../../core/http";
import { absUrl, originOf } from "../../core/url";
import { noSources } from "../provider-helpers";

const M3U8_RE = /file\s*:\s*["']([^"']+?\.m3u8[^"']*)["']/;
const LABEL_RE = /\blabel\s*:\s*["']([^"']+)["']/;

export async function extractVidmoly(playerUrl: string, label: string): Promise<ExtractorResult> {
    const origin = originOf(playerUrl);
    if (!origin) return noSources();

    const headers = { Referer: `${origin}/` };
    const html = await fetchText(playerUrl, { headers });
    if (!html) return noSources();

    const match = M3U8_RE.exec(html);
    const m3u8 = match?.[1];
    if (!match || !m3u8) return noSources();

    const quality = LABEL_RE.exec(html.slice(match.index + match[0].length))?.[1]?.trim() || "Auto";

    return {
        sources: [{
            url: absUrl(m3u8, playerUrl),
            type: "m3u8",
            quality: `${quality} - ${label}`,
            label,
            subtitles: [],
        }],
        headers,
    };
}
