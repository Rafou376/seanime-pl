import { ANY_TAG } from "./elements";
import { cachedRegex, escapeRegExp } from "./regex";
import { decodeEntities } from "./text";

export const ATTR_VALUE = `(?:"([^"]*)"|'([^']*)')`;
const OPEN_TAG_RE = /^<[^>]+>/;
export type MatchMode = "exact" | "word";

function attrValuePattern(escaped: string, quote: string, mode: MatchMode): string {
    return mode === "exact" ? escaped : `(?:[^${quote}]*\\s)?${escaped}(?:\\s[^${quote}]*)?`;
}

export function attrPattern(name: string, value: string, mode: MatchMode): string {
    const escaped = escapeRegExp(value);

    return `\\s${escapeRegExp(name)}\\s*=\\s*(?:"${attrValuePattern(escaped, '"', mode)}"|'${attrValuePattern(escaped, "'", mode)}')`;
}

export function attrCapture(name: string): string {
    return `\\s${escapeRegExp(name)}\\s*=\\s*${ATTR_VALUE}`;
}

export function getTagAttr(tag: string, name: string): string | null {
    const match = cachedRegex(attrCapture(name), "i").exec(OPEN_TAG_RE.exec(tag)?.[0] ?? tag);
    return match ? decodeEntities(match[1] ?? match[2] ?? "") : null;
}

export function getAttr(
    html: string,
    targetAttr: string,
    match: { attr: string; value: string; exact?: boolean },
    tag: string = ANY_TAG,
): string | null {
    const matchPattern = attrPattern(match.attr, match.value, match.exact ? "exact" : "word");
    const targetPattern = attrCapture(targetAttr);

    const forward = cachedRegex(`<${tag}\\b[^>]*${matchPattern}[^>]*${targetPattern}`, "i");
    const backward = cachedRegex(`<${tag}\\b[^>]*${targetPattern}[^>]*${matchPattern}`, "i");

    const first = forward.exec(html);
    const second = backward.exec(html);
    const found = first && second ? (second.index < first.index ? second : first) : (first ?? second);
    return found ? decodeEntities(found[1] ?? found[2] ?? "") : null;
}

export function getInputValue(html: string, name: string, tag: string = "input"): string | null {
    return getAttr(html, "value", { attr: "name", value: name, exact: true }, tag);
}
