import { attrPattern, getAttr, getTagAttr } from "./attributes";
import { ANY_TAG, elementBody, extractElementText, findMatchingClose, isVoidMatch, openTags } from "./elements";
import { cachedRegex } from "./regex";
import { WHITESPACE_RE, stripTags } from "./text";

function openTagPattern(className: string, tag: string): string {
    return `<(${tag})\\b[^>]*${attrPattern("class", className, "word")}[^>]*>`;
}

export function classTokens(openTag: string): string[] {
    return (getTagAttr(openTag, "class") ?? "").split(WHITESPACE_RE).filter(Boolean);
}

function hasClassPrefix(openTag: string, prefix: string): boolean {
    return classTokens(openTag).some((token) => token.startsWith(prefix));
}

function findOpenTagByClassPrefix(html: string, prefix: string, tag: string): RegExpExecArray | null {
    for (const match of openTags(html, tag)) {
        if (hasClassPrefix(match[0], prefix)) return match;
    }

    return null;
}

export function getAttrByClass(html: string, className: string, targetAttr: string, tag?: string): string | null {
    return getAttr(html, targetAttr, { attr: "class", value: className }, tag);
}

export function getLinkHrefByClass(html: string, className: string, tag: string = "a"): string | null {
    return getAttrByClass(html, className, "href", tag);
}

export function getTextByClass(html: string, className: string, tag: string = ANY_TAG): string | null {
    const match = cachedRegex(openTagPattern(className, tag), "i").exec(html);
    if (!match) return null;

    return extractElementText(html, match);
}

export function getTextByClassPrefix(html: string, prefix: string, tag: string = ANY_TAG): string | null {
    for (const match of openTags(html, tag)) {
        if (!hasClassPrefix(match[0], prefix)) continue;

        const body = elementBody(html, match);
        if (body === null || findOpenTagByClassPrefix(body, prefix, tag) !== null) continue;

        const text = stripTags(body);
        if (text) return text;
    }

    return null;
}

export function getBlocksByClass(html: string, className: string, tag: string = ANY_TAG, limit: number = Infinity): string[] {
    const re = cachedRegex(openTagPattern(className, tag), "gi");
    const blocks: string[] = [];
    let match: RegExpExecArray | null;

    while (blocks.length < limit && (match = re.exec(html)) !== null) {
        const tagName = match[1] ?? "";

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

export function getBlockByClass(html: string, className: string, tag: string = ANY_TAG): string | null {
    return getBlocksByClass(html, className, tag, 1)[0] ?? null;
}
