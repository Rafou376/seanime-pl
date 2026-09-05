import type { ExtractorResult } from "./types";
import { getInputValue, getLinkHrefByClass } from "../utils/html";
import { wait } from "../utils/timing";

const VIDEO_ID_RE = /(?:embed-|\/d\/)([a-zA-Z0-9_-]+)/;

function extractQualities(html: string): { url: string; resolution: string }[] {
    const qualities: { url: string; resolution: string }[] = [];
    const table = html.match(/<table class="tbl1"[\s\S]*?<\/table>/)?.[0];
    if (!table) return qualities;

    const rows = table.split("<tr>").slice(1);

    for (const row of rows) {
        const url = row.match(/href="([^"]+)"/)?.[1];
        if (!url) continue;

        const resolution = row.match(/<td>([^,<]+),/)?.[1]?.trim() || "Auto";
        qualities.push({ url, resolution });
    }

    return qualities;
}

async function resolveQuality(qualityUrl: string, resolution: string, label: string): Promise<VideoSource | null> {
    try {
        const videoId = qualityUrl.match(VIDEO_ID_RE)?.[1];

        const res = await fetch(qualityUrl);
        if (!res.ok) return null;

        const html = await res.text();

        const hash = getInputValue(html, "hash");
        const op = getInputValue(html, "op") || "download_orig";
        const id = getInputValue(html, "id") || videoId;
        const mode = getInputValue(html, "mode") || "n";

        if (!hash || !id) return null;

        wait(1000 + Math.random() * 500);

        const body = new URLSearchParams({ op, id, mode, hash });

        const postRes = await fetch(qualityUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        });

        if (!postRes.ok) return null;

        const postHtml = await postRes.text();
        const mp4Url = getLinkHrefByClass(postHtml, "download-btn");
        if (!mp4Url) return null;

        return {
            url: mp4Url,
            type: "mp4",
            quality: `${resolution} - ${label}`,
            label,
            subtitles: [],
        };
    } catch {
        return null;
    }
}

export async function extractUqload(playerUrl: string, label: string): Promise<ExtractorResult> {
    try {
        const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
        if (!videoId) return { sources: [] };

        const origin = new URL(playerUrl).origin;

        const res1 = await fetch(`${origin}/d/${videoId}`);
        if (!res1.ok) return { sources: [] };

        const html1 = await res1.text();
        const qualities = extractQualities(html1);
        if (!qualities.length) return { sources: [] };

        const sources = (await Promise.all(qualities.map((q) => resolveQuality(q.url, q.resolution, label))))
            .filter((source): source is VideoSource => source !== null);

        if (!sources.length) return { sources: [] };

        return { sources, headers: { Referer: `${origin}/` } };
    } catch {
        return { sources: [] };
    }
}
