const ORIGIN_RE = /^[a-z][a-z\d+.-]*:\/\/[^/]+/i;
const HTTP_URL_RE = /^https?:\/\//i;
const LEADING_SLASHES_RE = /^\/+/;

const DIRECTORY_RE = /^[^?#]*\//;
const PARTS_RE = /^([^?#]*)(?:\?([^#]*))?(#.*)?$/;

export function absUrl(path: string, baseUrl: string): string {
    if (isAbsoluteUrl(path)) return path;

    const origin = originOf(baseUrl) ?? "";
    if (path.startsWith("//")) return origin.slice(0, origin.indexOf(":") + 1) + path;
    if (path.startsWith("/")) return origin + path;

    const directory = DIRECTORY_RE.exec(baseUrl.slice(origin.length))?.[0] ?? "/";
    const segments: string[] = [];

    for (const segment of (directory + path).split("/")) {
        if (segment === "..") {
            if (segments.length > 1) segments.pop();
        } else if (segment !== ".") {
            segments.push(segment);
        }
    }

    return origin + segments.join("/");
}

export function isAbsoluteUrl(url: string): boolean {
    return HTTP_URL_RE.test(url);
}

export function trimLeadingSlashes(value: string): string {
    return value.replace(LEADING_SLASHES_RE, "");
}

export function relativePath(url: string): string {
    return trimLeadingSlashes(url.replace(ORIGIN_RE, "").split("#")[0] ?? "");
}

export function originOf(url: string): string | null {
    return ORIGIN_RE.exec(url)?.[0] ?? null;
}

export function pathOf(url: string): string {
    return PARTS_RE.exec(url.replace(ORIGIN_RE, ""))?.[1] || "/";
}

export function queryParam(url: string, name: string): string | null {
    return new URLSearchParams(PARTS_RE.exec(url)?.[2] ?? "").get(name);
}

export function withQuery(url: string, params: Record<string, string>): string {
    const [, base = "", query = "", hash = ""] = PARTS_RE.exec(url) ?? [];
    const search = new URLSearchParams(query);

    for (const [name, value] of Object.entries(params)) search.set(name, value);

    return `${base}?${search.toString()}${hash}`;
}
