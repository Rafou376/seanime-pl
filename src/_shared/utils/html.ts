const ANY_TAG = "[a-zA-Z][a-zA-Z0-9]*";
const ATTR_VALUE = `["']([^"']*)["']`;

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

export function getImageUrl(html: string, tag: string = "img"): string | null {
    const match =
        html.match(new RegExp(`<${tag}\\b[^>]*\\bdata-src=["']([^"']+)["']`, "i")) ??
        html.match(new RegExp(`<${tag}\\b[^>]*\\bsrc=["']([^"']+)["']`, "i"));

    return match?.[1] ?? null;
}

function stripTags(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
