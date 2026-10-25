import { absUrl, getBlocksByClass, getLinkHrefByClass, getTagAttr, getTextByClass } from "../../utils/html";
import { fetchForm, fetchText } from "../../utils/http";
import { wait } from "../../utils/timing";
import { parseDownloadForm } from "../../utils/xfs-download-form";
import { noSources } from "../provider-helpers";

const VIDEO_ID_RE = /(?:embed-|\/d\/)([a-zA-Z0-9_-]+)/;
const DIMENSIONS_RE = /\d+\s*[×x]\s*\d+/;

function extractQualities(html: string, baseUrl: string): { url: string; resolution: string }[] {
    const qualities: { url: string; resolution: string }[] = [];

    for (const row of getBlocksByClass(html, "pg-dlv__row", "a")) {
        const href = getTagAttr(row, "href");
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

    const formHtml = await fetchText(qualityUrl);
    if (!formHtml) return null;

    const fields = parseDownloadForm(formHtml, videoId);
    if (!fields) return null;

    wait(1000 + Math.random() * 500);

    const resultHtml = await fetchForm(qualityUrl, fields);
    if (!resultHtml) return null;

    const mp4Url = getLinkHrefByClass(resultHtml, "download-btn");
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
    const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
    if (!videoId) return noSources();

    const origin = new URL(playerUrl).origin;

    const listingHtml = await fetchText(`${origin}/d/${videoId}`);
    if (!listingHtml) return noSources();

    const qualities = extractQualities(listingHtml, `${origin}/`);
    if (!qualities.length) return noSources();

    const sources = (await Promise.all(qualities.map((q) => resolveQuality(q.url, q.resolution, label))))
        .filter((source): source is VideoSource => source !== null);

    return { sources, headers: { Referer: `${origin}/` } };
}
