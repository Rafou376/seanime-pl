import { ATTR_VALUE } from "./attributes";
import { extractElementText } from "./elements";
import { cachedRegex } from "./regex";
import { decodeEntities } from "./text";

export type Anchor = { href: string; content: string };
const ANCHOR_RE = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi;
const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

export function getFirstLink(html: string, tag: string = "a"): { href: string; text: string } | null {
    const match = cachedRegex(`<(${tag})\\b[^>]*\\shref\\s*=\\s*${ATTR_VALUE}[^>]*>`, "i").exec(html);
    if (!match) return null;

    return { href: decodeEntities(match[2] ?? match[3] ?? ""), text: extractElementText(html, match) ?? "" };
}

export function getAnchors(html: string): Anchor[] {
    return [...html.matchAll(ANCHOR_RE)].map((match) => ({ href: decodeEntities(match[1] ?? match[2] ?? ""), content: match[3] ?? "" }));
}

export function scriptContaining(html: string, needle: string): string | null {
    for (const match of html.matchAll(SCRIPT_RE)) {
        const body = match[1];
        if (body?.includes(needle)) return body;
    }

    return null;
}
