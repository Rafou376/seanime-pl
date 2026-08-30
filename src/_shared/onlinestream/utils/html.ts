const ANY_TAG = "[a-zA-Z][a-zA-Z0-9]*";
const ATTR_VALUE = `["']([^"']*)["']`;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
