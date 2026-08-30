import type { ExtractorResult } from "./types";
import { getInputValue, getLinkHrefByClass } from "../utils/html";

const API_URL = "https://vidzy.live/d";
const VIDEO_ID_RE = /(?:embed-|\/v\/\d+\/\d+\/)([a-zA-Z0-9]+)/;

export async function extractVidzy(playerUrl: string, label: string): Promise<ExtractorResult> {
    try {
        const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
        if (!videoId) return { sources: [] };

        const targetUrl = `${API_URL}/${videoId}_n`;

        const res1 = await fetch(targetUrl);
        if (!res1.ok) return { sources: [] };

        const html1 = await res1.text();

        const hash = getInputValue(html1, "hash");
        const op = getInputValue(html1, "op") || "download_orig";
        const id = getInputValue(html1, "id") || videoId;
        const mode = getInputValue(html1, "mode") || "n";

        if (!hash) return { sources: [] };

        const body = new URLSearchParams({ op, id, mode, hash });

        const res2 = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        });

        if (!res2.ok) return { sources: [] };

        const html2 = await res2.text();
        const rawUrl = getLinkHrefByClass(html2, "main-button");
        if (!rawUrl) return { sources: [] };

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
        return { sources: [] };
    }
}