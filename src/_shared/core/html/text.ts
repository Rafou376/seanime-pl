const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
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

const SCRIPT_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi;
const TAG_RE = /<\/?[a-zA-Z!][^>]*>/g;
export const WHITESPACE_RE = /\s+/g;

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

export function stripTags(html: string, joiner: string = " "): string {
    return decodeEntities(html.replace(SCRIPT_STYLE_RE, " ").replace(TAG_RE, joiner))
        .replace(WHITESPACE_RE, " ")
        .trim();
}
