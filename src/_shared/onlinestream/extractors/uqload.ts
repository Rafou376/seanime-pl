import { getText } from "../../core/html";
import { fetchForm, fetchText } from "../../core/http";
import { absUrl, originOf } from "../../core/url";
import { noSources, videoSource } from "../provider-helpers";
import { parseDownloadForm } from "../xfs-download-form";

const VIDEO_ID_RE = /(?:embed-|\/d\/)([a-zA-Z0-9_-]+)/;
const DIMENSIONS_RE = /\d+\s*[×x]\s*\d+/;

function extractQualities(html: string, baseUrl: string): { url: string; resolution: string }[] {
    const qualities: { url: string; resolution: string }[] = [];

    LoadDoc(html)("a.pg-dlv__row").each((_, row) => {
        const href = row.attr("href");
        if (!href) return;

        const name = getText(row.find("span.pg-dlv__q").first());
        const size = getText(row.find("span.pg-dlv__meta").first()).match(DIMENSIONS_RE)?.[0];
        const resolution = name && size ? `${name} (${size})` : name || size || "";

        qualities.push({ url: absUrl(href, baseUrl), resolution });
    });

    return qualities;
}

async function resolveQuality(qualityUrl: string, resolution: string, label: string): Promise<VideoSource | null> {
    const videoId = qualityUrl.match(VIDEO_ID_RE)?.[1];

    const formHtml = await fetchText(qualityUrl);
    if (!formHtml) return null;

    const fields = parseDownloadForm(formHtml, videoId);
    if (!fields) return null;

    $sleep(1000 + Math.random() * 500);

    const resultHtml = await fetchForm(qualityUrl, fields);
    if (!resultHtml) return null;

    const mp4Url = LoadDoc(resultHtml)("a.download-btn[href]").first().attr("href");
    if (!mp4Url) return null;

    return videoSource("mp4", mp4Url, label, resolution);
}

export async function extractUqload(playerUrl: string, label: string): Promise<ExtractorResult> {
    const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
    if (!videoId) return noSources();

    const origin = originOf(playerUrl);
    if (!origin) return noSources();

    const listingHtml = await fetchText(`${origin}/d/${videoId}`);
    if (!listingHtml) return noSources();

    const qualities = extractQualities(listingHtml, `${origin}/`);
    if (!qualities.length) return noSources();

    const sources = (await Promise.all(qualities.map((q) => resolveQuality(q.url, q.resolution, label))))
        .filter((source): source is VideoSource => source !== null);

    return { sources, headers: { Referer: `${origin}/` } };
}
