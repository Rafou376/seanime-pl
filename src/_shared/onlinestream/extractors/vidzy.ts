import { getInputValue, getLinkHrefByClass } from "../../utils/html";
import { fetchForm, fetchText } from "../../utils/http";
import { noSources } from "../provider-helpers";

const VIDEO_ID_RE = /(?:embed-|\/v\/\d+\/\d+\/)([a-zA-Z0-9]+)/;

export async function extractVidzy(playerUrl: string, label: string): Promise<ExtractorResult> {
    try {
        const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
        if (!videoId) return noSources();

        const origin = new URL(playerUrl).origin;
        const targetUrl = `${origin}/d/${videoId}_n`;

        const html1 = await fetchText(targetUrl);
        if (!html1) return noSources();

        const hash = getInputValue(html1, "hash");
        const op = getInputValue(html1, "op") || "download_orig";
        const id = getInputValue(html1, "id") || videoId;
        const mode = getInputValue(html1, "mode") || "n";

        if (!hash) return noSources();

        const html2 = await fetchForm(targetUrl, { op, id, mode, hash });
        if (!html2) return noSources();

        const rawUrl = getLinkHrefByClass(html2, "main-button");
        if (!rawUrl) return noSources();

        return {
            sources: [{
                url: rawUrl,
                type: "mp4",
                quality: `Auto - ${label}`,
                label,
                subtitles: [],
            }],
        };
    } catch {
        return noSources();
    }
}
