import { originOf } from "../../core/url";
import { noSources, videoSource } from "../provider-helpers";
import { fetchDirectDownloadUrl } from "../xfs-download-form";

const VIDEO_ID_RE = /(?:embed-|\/v\/\d+\/\d+\/)([a-zA-Z0-9]+)/;

export async function extractVidzy(playerUrl: string, label: string): Promise<ExtractorResult> {
    const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
    if (!videoId) return noSources();

    const origin = originOf(playerUrl);
    if (!origin) return noSources();

    const rawUrl = await fetchDirectDownloadUrl(`${origin}/d/${videoId}_n`, videoId, "main-button");
    if (!rawUrl) return noSources();

    return { sources: [videoSource("mp4", rawUrl, label)] };
}
