import { base64ToBinaryString, reverse, rot13, shiftChars } from "../../core/encoding";
import { firstText } from "../../core/html";
import { fetchText } from "../../core/http";
import { parseJson } from "../../core/json";
import { absUrl, originOf } from "../../core/url";
import { fetchHlsSources } from "../hls";
import { noSources, videoSource } from "../provider-helpers";

type VoeData = {
    source?: string;
    direct_access_url?: string;
};

type Page = {
    html: string;
    url: string;
};

const JSON_SCRIPT = 'script[type="application/json"]';
const PAYLOAD_RE = /\["([\s\S]*)"\]/;
const REDIRECT_RE = /window\.location\.href\s*=\s*'([^']+)';/;
const NOISE_RE = /@\$|\^\^|~@|%\?|\*~|!!|#&|_/g;
const CHAR_SHIFT = 3;

export function decryptVoePayload(payload: string): VoeData | null {
    const cleaned = rot13(payload).replace(NOISE_RE, "");
    const decoded = reverse(shiftChars(base64ToBinaryString(cleaned), CHAR_SHIFT));

    return parseJson<VoeData>(base64ToBinaryString(decoded));
}

async function fetchPage(url: string): Promise<Page | null> {
    const origin = originOf(url);
    const html = origin ? await fetchText(url, { headers: { Referer: `${origin}/` } }) : null;

    return html ? { html, url } : null;
}

async function fetchPlayerPage(playerUrl: string): Promise<Page | null> {
    const page = await fetchPage(playerUrl);
    const redirect = page ? REDIRECT_RE.exec(firstText(page.html, "script") ?? "")?.[1] : undefined;

    return redirect ? fetchPage(absUrl(redirect, playerUrl)) : page;
}

export async function extractVoe(playerUrl: string, label: string): Promise<ExtractorResult> {
    const page = await fetchPlayerPage(playerUrl);
    const encoded = page ? PAYLOAD_RE.exec(firstText(page.html, JSON_SCRIPT)?.trim() ?? "")?.[1] : undefined;
    const data = encoded ? decryptVoePayload(encoded) : null;
    const origin = page ? originOf(page.url) : null;
    if (!data || !origin) return noSources();

    const headers = { Referer: `${origin}/` };

    const hls = data.source ? await fetchHlsSources(data.source, headers, label) : [];
    if (hls.length > 0) return { sources: hls, headers };

    return data.direct_access_url
        ? { sources: [videoSource("mp4", data.direct_access_url, label)], headers }
        : noSources();
}
