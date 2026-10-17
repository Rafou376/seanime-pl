import { absUrl, getAttrByClass, getBlocksByClass, getInputValue, getLinkHrefByClass, getTextByClass } from "../../utils/html";
import { fetchForm, fetchText } from "../../utils/http";
import { noSources } from "../provider-helpers";
import { wait } from "../../utils/timing";

const VIDEO_ID_RE = /(?:embed-|\/d\/)([a-zA-Z0-9_-]+)/;
const DIMENSIONS_RE = /\d+\s*[×x]\s*\d+/;

function extractQualities(html: string, baseUrl: string): { url: string; resolution: string }[] {
    const qualities: { url: string; resolution: string }[] = [];

    for (const row of getBlocksByClass(html, "pg-dlv__row", "a")) {
        const href = getAttrByClass(row, "pg-dlv__row", "href", "a");
        if (!href) continue;

        const name = getTextByClass(row, "pg-dlv__q", "span");
        const size = getTextByClass(row, "pg-dlv__meta", "span")?.match(DIMENSIONS_RE)?.[0];
        const resolution = name && size ? `${name} (${size})` : name || size || "Auto";

        qualities.push({ url: absUrl(href, baseUrl), resolution });
    }

    return qualities;
}

async function resolveQuality(qualityUrl: string, resolution: string, label: string): Promise<VideoSource | null> {
    const videoId = qualityUrl.match(VIDEO_ID_RE)?.[1];

    const html = await fetchText(qualityUrl);
    if (!html) return null;

    const hash = getInputValue(html, "hash");
    const op = getInputValue(html, "op") || "download_orig";
    const id = getInputValue(html, "id") || videoId;
    const mode = getInputValue(html, "mode") || "n";

    if (!hash || !id) return null;

    wait(1000 + Math.random() * 500);

    const postHtml = await fetchForm(qualityUrl, { op, id, mode, hash });
    if (!postHtml) return null;

    const mp4Url = getLinkHrefByClass(postHtml, "download-btn");
    if (!mp4Url) return null;

    return {
        url: mp4Url,
        type: "mp4",
        quality: `${resolution} - ${label}`,
        label,
        subtitles: [],
    };
}

export async function extractUqload(playerUrl: string, label: string): Promise<ExtractorResult> {
    try {
        const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
        if (!videoId) return noSources();

        const origin = new URL(playerUrl).origin;

        const html1 = await fetchText(`${origin}/d/${videoId}`);
        if (!html1) return noSources();

        const qualities = extractQualities(html1, `${origin}/`);
        if (!qualities.length) return noSources();

        const sources = (await Promise.all(qualities.map((q) => resolveQuality(q.url, q.resolution, label))))
            .filter((source): source is VideoSource => source !== null);

        if (!sources.length) return noSources();

        return { sources, headers: { Referer: `${origin}/` } };
    } catch {
        return noSources();
    }
}
