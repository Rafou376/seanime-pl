const ANY_TAG = "[a-zA-Z][a-zA-Z0-9]*";
const ATTR_VALUE = `["']([^"']*)["']`;

const ORIGIN_RE = /^[a-z][a-z\d+.-]*:\/\/[^/]+/i;
const ANCHOR_RE = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi;
const STYLE_URL_RE = /url\(\s*["']?([^"')]+?)["']?\s*\)/i;
const OPEN_TAG_RE = /^<[^>]+>/;
const ATTR_RES = new Map<string, RegExp>();

export type Anchor = { href: string; content: string };

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openTagPattern(className: string, tag: string): string {
    return `<(${tag})\\b[^>]*\\bclass=["'][^"']*\\b${escapeRegExp(className)}\\b[^"']*["'][^>]*>`;
}

function isVoidMatch(tagName: string, openTag: string): boolean {
    return VOID_TAGS.has(tagName.toLowerCase()) || /\/>\s*$/.test(openTag);
}

function classTokens(openTag: string): string[] {
    const value = openTag.match(/\bclass=["']([^"']*)["']/i)?.[1] ?? "";
    return value.split(/\s+/).filter(Boolean);
}

function findOpenTagByClassPrefix(html: string, prefix: string, tag: string): RegExpExecArray | null {
    const re = new RegExp(`<(${tag})\\b[^>]*>`, "gi");
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
        if (classTokens(match[0]).some((token) => token.startsWith(prefix))) return match;
    }

    return null;
}

function findMatchingClose(html: string, tagName: string, fromIndex: number): RegExpExecArray | null {
    const openRe = new RegExp(`<${tagName}\\b`, "gi");
    const closeRe = new RegExp(`</${tagName}\\s*>`, "gi");

    let depth = 1;
    let cursor = fromIndex;

    while (depth > 0) {
        openRe.lastIndex = cursor;
        closeRe.lastIndex = cursor;
        const nextOpen = openRe.exec(html);
        const nextClose = closeRe.exec(html);
        if (!nextClose) return null;

        if (nextOpen && nextOpen.index < nextClose.index) {
            depth++;
            cursor = nextOpen.index + nextOpen[0].length;
        } else {
            depth--;
            if (depth === 0) return nextClose;
            cursor = nextClose.index + nextClose[0].length;
        }
    }

    return null;
}

function elementBody(html: string, match: RegExpExecArray): string | null {
    const tagName = match[1];
    if (isVoidMatch(tagName, match[0])) return null;

    const startIndex = match.index + match[0].length;
    const close = findMatchingClose(html, tagName, startIndex);
    return close ? html.slice(startIndex, close.index) : null;
}

function isLeafMatch(html: string, match: RegExpExecArray, prefix: string, tag: string): boolean {
    const body = elementBody(html, match);
    if (body === null) return true;

    return findOpenTagByClassPrefix(body, prefix, tag) === null;
}

function extractElementText(html: string, match: RegExpExecArray): string | null {
    const body = elementBody(html, match);
    return body === null ? null : stripTags(body) || null;
}

export function getAttr(
    html: string,
    targetAttr: string,
    match: { attr: string; value: string; exact?: boolean },
    tag: string = ANY_TAG,
): string | null {
    const value = escapeRegExp(match.value);
    const matchPattern = match.exact
        ? `${match.attr}=["']${value}["']`
        : `${match.attr}=["'][^"']*\\b${value}\\b[^"']*["']`;
    const targetPattern = `${targetAttr}=${ATTR_VALUE}`;

    const forward = new RegExp(`<${tag}\\b[^>]*\\b${matchPattern}[^>]*\\b${targetPattern}`, "i");
    const backward = new RegExp(`<${tag}\\b[^>]*\\b${targetPattern}[^>]*\\b${matchPattern}`, "i");

    return html.match(forward)?.[1] ?? html.match(backward)?.[1] ?? null;
}

export function getAttrByClass(html: string, className: string, targetAttr: string, tag?: string): string | null {
    return getAttr(html, targetAttr, { attr: "class", value: className }, tag);
}

export function getInputValue(html: string, name: string, tag: string = "input"): string | null {
    return getAttr(html, "value", { attr: "name", value: name, exact: true }, tag);
}

export function getLinkHrefByClass(html: string, className: string, tag: string = "a"): string | null {
    return getAttrByClass(html, className, "href", tag);
}

export function getTextByClass(html: string, className: string, tag: string = ANY_TAG): string | null {
    const match = new RegExp(openTagPattern(className, tag), "i").exec(html);
    if (!match) return null;

    return extractElementText(html, match);
}

export function getTextByClassPrefix(html: string, prefix: string, tag: string = ANY_TAG): string | null {
    const re = new RegExp(`<(${tag})\\b[^>]*>`, "gi");
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
        if (!classTokens(match[0]).some((token) => token.startsWith(prefix))) continue;
        if (!isLeafMatch(html, match, prefix, tag)) continue;

        const text = extractElementText(html, match);
        if (text) return text;
    }

    return null;
}

export function getBlocksByClass(html: string, className: string, tag: string = ANY_TAG): string[] {
    const re = new RegExp(openTagPattern(className, tag), "gi");
    const blocks: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
        const tagName = match[1];

        if (isVoidMatch(tagName, match[0])) {
            blocks.push(match[0]);
            re.lastIndex = match.index + match[0].length;
            continue;
        }

        const startIndex = match.index + match[0].length;
        const close = findMatchingClose(html, tagName, startIndex);
        if (!close) continue;

        const endIndex = close.index + close[0].length;
        blocks.push(html.slice(match.index, endIndex));
        re.lastIndex = endIndex;
    }

    return blocks;
}

export function getFirstLink(html: string, tag: string = "a"): { href: string; text: string } | null {
    const match = new RegExp(`<(${tag})\\b[^>]*\\bhref=${ATTR_VALUE}[^>]*>`, "i").exec(html);
    if (!match) return null;

    return { href: match[2], text: extractElementText(html, match) ?? "" };
}

export function getImageSource(tag: string, attrs: string[]): string | null {
    for (const name of attrs) {
        const value = getTagAttr(tag, name);
        if (!value) continue;

        const url = name === "style" ? STYLE_URL_RE.exec(value)?.[1] : name === "data-srcset" ? value.trim().split(/[\s,]+/)[0] : value;
        if (url) return url;
    }

    return null;
}

export function getImageUrl(html: string, tag: string = "img"): string | null {
    for (const match of html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))) {
        const url = getImageSource(match[0], ["data-src", "src"]);
        if (url) return url;
    }

    return null;
}

export function stripTags(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function absUrl(path: string, baseUrl: string): string {
    try {
        return new URL(path, baseUrl).toString();
    } catch {
        return path;
    }
}

export function relativePath(url: string): string {
    return url.replace(ORIGIN_RE, "").split("#")[0].replace(/^\/+/, "");
}

export function getTagAttr(tag: string, name: string): string | null {
    let re = ATTR_RES.get(name);

    if (!re) {
        re = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
        ATTR_RES.set(name, re);
    }

    const match = re.exec(OPEN_TAG_RE.exec(tag)?.[0] ?? tag);
    return match ? (match[1] ?? match[2]) : null;
}

export function getAnchors(html: string): Anchor[] {
    return [...html.matchAll(ANCHOR_RE)].map((match) => ({ href: match[1] ?? match[2], content: match[3] }));
}

export function chapterOrderValue(chapter: string): number {
    const value = parseFloat(chapter);
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export function sortChapters<T extends { chapter: string }>(chapters: T[]): (T & { index: number })[] {
    return chapters
        .sort((a, b) => chapterOrderValue(a.chapter) - chapterOrderValue(b.chapter))
        .map((chapter, index) => ({ ...chapter, index }));
}

export function scriptContaining(html: string, needle: string): string | null {
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;

    while ((match = re.exec(html)) !== null) {
        if (match[1].includes(needle)) return match[1];
    }

    return null;
}
