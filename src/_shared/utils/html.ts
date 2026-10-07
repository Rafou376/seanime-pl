const ANY_TAG = "[a-zA-Z][a-zA-Z0-9]*";
const ATTR_VALUE = `(?:"([^"]*)"|'([^']*)')`;

const ORIGIN_RE = /^[a-z][a-z\d+.-]*:\/\/[^/]+/i;
const HTTP_URL_RE = /^https?:\/\//i;
const ANCHOR_RE = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi;
const STYLE_URL_RE = /url\(\s*["']?([^"')]+?)["']?\s*\)/i;
const OPEN_TAG_RE = /^<[^>]+>/;
const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;
const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const SRCSET_CANDIDATE_RE = /(\S+?)(?:\s+(\d+(?:\.\d+)?)[wx]\s*(?:,|$)|\s*(?:,\s+|,?$))/g;
const DATA_URL_RE = /^data:/i;
const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const REGEX_CACHE = new Map<string, RegExp>();

const ENTITIES = new Map([
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
    ["nbsp", " "],
    ["rsquo", "\u2019"],
    ["lsquo", "\u2018"],
    ["rdquo", "\u201D"],
    ["ldquo", "\u201C"],
    ["hellip", "\u2026"],
    ["ndash", "\u2013"],
    ["mdash", "\u2014"],
    ["laquo", "\u00AB"],
    ["raquo", "\u00BB"],
    ["eacute", "\u00E9"],
    ["egrave", "\u00E8"],
    ["ecirc", "\u00EA"],
    ["euml", "\u00EB"],
    ["agrave", "\u00E0"],
    ["acirc", "\u00E2"],
    ["icirc", "\u00EE"],
    ["iuml", "\u00EF"],
    ["ocirc", "\u00F4"],
    ["ugrave", "\u00F9"],
    ["ucirc", "\u00FB"],
    ["uuml", "\u00FC"],
    ["ccedil", "\u00E7"],
    ["oelig", "\u0153"],
    ["Eacute", "\u00C9"],
    ["Egrave", "\u00C8"],
    ["Ecirc", "\u00CA"],
    ["Euml", "\u00CB"],
    ["Agrave", "\u00C0"],
    ["Acirc", "\u00C2"],
    ["Icirc", "\u00CE"],
    ["Iuml", "\u00CF"],
    ["Ocirc", "\u00D4"],
    ["Ugrave", "\u00D9"],
    ["Ucirc", "\u00DB"],
    ["Uuml", "\u00DC"],
    ["Ccedil", "\u00C7"],
    ["OElig", "\u0152"],
]);

export type Anchor = { href: string; content: string };

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cachedRegex(source: string, flags: string): RegExp {
    const key = `${flags}/${source}`;
    let re = REGEX_CACHE.get(key);

    if (re) {
        re.lastIndex = 0;
    } else {
        re = new RegExp(source, flags);
        REGEX_CACHE.set(key, re);
    }

    return re;
}

type MatchMode = "exact" | "word";

function attrValuePattern(escaped: string, quote: string, mode: MatchMode): string {
    return mode === "exact" ? escaped : `(?:[^${quote}]*\\s)?${escaped}(?:\\s[^${quote}]*)?`;
}

function attrPattern(name: string, value: string, mode: MatchMode): string {
    const escaped = escapeRegExp(value);

    return `\\s${escapeRegExp(name)}\\s*=\\s*(?:"${attrValuePattern(escaped, '"', mode)}"|'${attrValuePattern(escaped, "'", mode)}')`;
}

function attrCapture(name: string): string {
    return `\\s${escapeRegExp(name)}\\s*=\\s*${ATTR_VALUE}`;
}

function openTagPattern(className: string, tag: string): string {
    return `<(${tag})\\b[^>]*${attrPattern("class", className, "word")}[^>]*>`;
}

function isVoidMatch(tagName: string, openTag: string): boolean {
    return VOID_TAGS.has(tagName.toLowerCase()) || /\/>\s*$/.test(openTag);
}

function classTokens(openTag: string): string[] {
    return (getTagAttr(openTag, "class") ?? "").split(/\s+/).filter(Boolean);
}

function hasClassPrefix(openTag: string, prefix: string): boolean {
    return classTokens(openTag).some((token) => token.startsWith(prefix));
}

function openTags(html: string, tag: string) {
    return html.matchAll(cachedRegex(`<(${tag})\\b[^>]*>`, "gi"));
}

function findOpenTagByClassPrefix(html: string, prefix: string, tag: string): RegExpExecArray | null {
    for (const match of openTags(html, tag)) {
        if (hasClassPrefix(match[0], prefix)) return match;
    }

    return null;
}

function findMatchingClose(html: string, tagName: string, fromIndex: number): RegExpExecArray | null {
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

function elementBody(html: string, match: RegExpExecArray): string | null {
    const tagName = match[1] ?? "";
    if (isVoidMatch(tagName, match[0])) return null;

    const startIndex = match.index + match[0].length;
    const close = findMatchingClose(html, tagName, startIndex);
    return close ? html.slice(startIndex, close.index) : null;
}

function extractElementText(html: string, match: RegExpExecArray): string | null {
    const body = elementBody(html, match);
    return body === null ? null : stripTags(body) || null;
}

function getAttr(
    html: string,
    targetAttr: string,
    match: { attr: string; value: string; exact?: boolean },
    tag: string = ANY_TAG,
): string | null {
    const matchPattern = attrPattern(match.attr, match.value, match.exact ? "exact" : "word");
    const targetPattern = attrCapture(targetAttr);

    const forward = cachedRegex(`<${tag}\\b[^>]*${matchPattern}[^>]*${targetPattern}`, "i");
    const backward = cachedRegex(`<${tag}\\b[^>]*${targetPattern}[^>]*${matchPattern}`, "i");

    const found = forward.exec(html) ?? backward.exec(html);
    return found ? decodeEntities(found[1] ?? found[2] ?? "") : null;
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

export function getFirstLink(html: string, tag: string = "a"): { href: string; text: string } | null {
    const match = cachedRegex(`<(${tag})\\b[^>]*\\shref\\s*=\\s*${ATTR_VALUE}[^>]*>`, "i").exec(html);
    if (!match) return null;

    return { href: decodeEntities(match[2] ?? match[3] ?? ""), text: extractElementText(html, match) ?? "" };
}

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

export function decodeEntities(text: string): string {
    return text.replace(ENTITY_RE, (full: string, body: string) => {
        if (body[0] !== "#") return ENTITIES.get(body) ?? ENTITIES.get(body.toLowerCase()) ?? full;

        const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);

        try {
            return String.fromCodePoint(code);
        } catch {
            return full;
        }
    });
}

export function stripTags(html: string): string {
    return decodeEntities(html.replace(SCRIPT_STYLE_RE, " ").replace(/<[^>]+>/g, " "))
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

export function isAbsoluteUrl(url: string): boolean {
    return HTTP_URL_RE.test(url);
}

export function trimLeadingSlashes(value: string): string {
    return value.replace(/^\/+/, "");
}

export function relativePath(url: string): string {
    return trimLeadingSlashes(url.replace(ORIGIN_RE, "").split("#")[0] ?? "");
}

function getTagAttr(tag: string, name: string): string | null {
    const match = cachedRegex(attrCapture(name), "i").exec(OPEN_TAG_RE.exec(tag)?.[0] ?? tag);
    return match ? decodeEntities(match[1] ?? match[2] ?? "") : null;
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
