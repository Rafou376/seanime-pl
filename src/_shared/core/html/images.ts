import { getTagAttr } from "./attributes";
import { openTags } from "./elements";

const STYLE_URL_RE = /url\(\s*["']?([^"')]+?)["']?\s*\)/i;
const SRCSET_CANDIDATE_RE = /(\S+?)(?:\s+(\d+(?:\.\d+)?)[wx]\s*(?:,|$)|\s*(?:,\s+|,?$))/g;
const DATA_URL_RE = /^data:/i;

function bestSrcsetUrl(srcset: string): string | null {
    let best: { url: string; weight: number } | null = null;

    for (const match of srcset.matchAll(SRCSET_CANDIDATE_RE)) {
        const url = match[1] ?? "";
        if (!url || DATA_URL_RE.test(url)) continue;

        const weight = match[2] ? parseFloat(match[2]) : 1;
        if (!best || weight > best.weight) best = { url, weight };
    }

    return best?.url ?? null;
}

export function getImageSource(tag: string, attrs: string[]): string | null {
    for (const name of attrs) {
        const value = getTagAttr(tag, name);
        if (!value) continue;

        const url = name === "style" ? STYLE_URL_RE.exec(value)?.[1] : name.endsWith("srcset") ? bestSrcsetUrl(value) : value;
        if (url && !DATA_URL_RE.test(url.trim())) return url;
    }

    return null;
}

export function getImageUrl(html: string, tag: string = "img"): string | null {
    for (const match of openTags(html, tag)) {
        const url = getImageSource(match[0], ["data-src", "data-lazy-src", "src"]);
        if (url) return url;
    }

    return null;
}
