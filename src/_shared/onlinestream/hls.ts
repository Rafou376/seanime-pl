import { fetchText } from "../core/http";
import { absUrl } from "../core/url";
import { videoSource } from "./provider-helpers";

export type HlsVariant = {
    url: string;
    height: number | null;
};

const BOM_RE = /^\uFEFF/;
const STREAM_INF_RE = /#EXT-X-STREAM-INF:([^\r\n]*)\r?\n\s*([^\r\n#][^\r\n]*)/g;
const HEIGHT_RE = /RESOLUTION=\d+x(\d+)/i;

export function isPlaylist(text: string | null): text is string {
    return text !== null && text.replace(BOM_RE, "").trimStart().startsWith("#EXTM3U");
}

export function parseVariants(playlist: string, masterUrl: string): HlsVariant[] {
    return [...playlist.matchAll(STREAM_INF_RE)]
        .map(([, attributes = "", uri = ""]) => {
            const height = parseInt(HEIGHT_RE.exec(attributes)?.[1] ?? "", 10);
            return { url: absUrl(uri.trim(), masterUrl), height: Number.isNaN(height) ? null : height };
        })
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

export async function fetchHlsSources(masterUrl: string, headers: Record<string, string>, label: string): Promise<VideoSource[]> {
    const playlist = await fetchText(masterUrl, { headers });
    if (!isPlaylist(playlist)) return [];

    const variants = parseVariants(playlist, masterUrl);
    if (variants.length === 0) return [videoSource("m3u8", masterUrl, label)];

    return variants.map(({ url, height }, index) => videoSource("m3u8", url, label, height ? `${height}p` : `Auto ${index + 1}`));
}
