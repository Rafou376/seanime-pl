import { unpack } from "../utils/unpacker";
import type { ExtractorResult } from "./types";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36";
const SCRIPT_TAG_RE = /<script[^>]*>([\s\S]*?)<\/script>/g;
const PACKER_RE = /\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\)/;
const VIDEO_URL_RE = /(?:https?:)?\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?|\/[^\s"'<>\\]+\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/g;

export async function extractGeneric(playerUrl: string, label: string): Promise<ExtractorResult> {
    try {
        const res = await fetch(playerUrl, {
            headers: { "User-Agent": USER_AGENT },
            redirect: "follow",
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { sources: [] };

        const html = await res.text();
        const finalUrl = res.url;

        let unpacked: string | undefined;
        let match: RegExpExecArray | null;

        SCRIPT_TAG_RE.lastIndex = 0;

        while ((match = SCRIPT_TAG_RE.exec(html)) !== null) {
            const script = match[1];
            if (!script.includes("eval(function(p,a,c,k,e,d)")) continue;

            const packerMatch = script.match(PACKER_RE);
            if (packerMatch) {
                unpacked = unpack(packerMatch[1], parseInt(packerMatch[2], 10), parseInt(packerMatch[3], 10), packerMatch[4].split("|"));
                break;
            }
        }

        const searchSource = unpacked ? `${html}\n${unpacked}` : html;
        const videoUrls = new Set(searchSource.match(VIDEO_URL_RE) ?? []);

        let origin = "";
        try {
            origin = new URL(finalUrl).origin;
        } catch {}

        const sources: VideoSource[] = [];

        for (const url of videoUrls) {
            let resolvedUrl = url;

            if (url.startsWith("//")) {
                resolvedUrl = `https:${url}`;
            } else if (url.startsWith("/")) {
                if (!origin) continue;
                resolvedUrl = origin + url;
            }

            sources.push({
                url: resolvedUrl,
                type: resolvedUrl.includes(".m3u8") ? "m3u8" : "mp4",
                quality: `Auto - ${label}`,
                label,
                subtitles: [],
            });
        }

        return { sources };
    } catch {
        return { sources: [] };
    }
}
