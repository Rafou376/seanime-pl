const ORIGIN_RE = /^[a-z][a-z\d+.-]*:\/\/[^/]+/i;
const HTTP_URL_RE = /^https?:\/\//i;
const LEADING_SLASHES_RE = /^\/+/;

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
    return value.replace(LEADING_SLASHES_RE, "");
}

export function relativePath(url: string): string {
    return trimLeadingSlashes(url.replace(ORIGIN_RE, "").split("#")[0] ?? "");
}

export function originOf(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
}
