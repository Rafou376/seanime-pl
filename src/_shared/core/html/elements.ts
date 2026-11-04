import { cachedRegex } from "./regex";
import { stripTags } from "./text";

export const ANY_TAG = "[a-zA-Z][a-zA-Z0-9]*";
const SELF_CLOSING_RE = /\/>\s*$/;
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

export function openTags(html: string, tag: string) {
    return html.matchAll(cachedRegex(`<(${tag})\\b[^>]*>`, "gi"));
}

export function isVoidMatch(tagName: string, openTag: string): boolean {
    return VOID_TAGS.has(tagName.toLowerCase()) || SELF_CLOSING_RE.test(openTag);
}

export function findMatchingClose(html: string, tagName: string, fromIndex: number): RegExpExecArray | null {
    const re = cachedRegex(`<(/?)${tagName}(?=[\\s>/])[^>]*>`, "gi");

    let depth = 1;
    let match: RegExpExecArray | null;

    re.lastIndex = fromIndex;

    while ((match = re.exec(html)) !== null) {
        if (match[1] === "/") {
            if (--depth === 0) return match;
        } else {
            depth++;
        }
    }

    return null;
}

export function elementBody(html: string, match: RegExpExecArray): string | null {
    const tagName = match[1] ?? "";
    if (isVoidMatch(tagName, match[0])) return null;

    const startIndex = match.index + match[0].length;
    const close = findMatchingClose(html, tagName, startIndex);
    return close ? html.slice(startIndex, close.index) : null;
}

export function extractElementText(html: string, match: RegExpExecArray): string | null {
    const body = elementBody(html, match);
    return body === null ? null : stripTags(body) || null;
}
