import { fetchDirectDownloadUrl } from "../../utils/xfs-download-form";
import { noSources } from "../provider-helpers";

const VIDEO_ID_RE = /(?:embed-|\/v\/\d+\/\d+\/)([a-zA-Z0-9]+)/;

export async function extractVidzy(playerUrl: string, label: string): Promise<ExtractorResult> {
    const videoId = playerUrl.match(VIDEO_ID_RE)?.[1];
    if (!videoId) return noSources();

    const origin = new URL(playerUrl).origin;
    const rawUrl = await fetchDirectDownloadUrl(`${origin}/d/${videoId}_n`, videoId, "main-button");
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
}
