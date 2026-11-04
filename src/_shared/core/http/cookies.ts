export function cookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
}

export function parseSetCookie(res: { headers: { get(name: string): string | null } }): Record<string, string> {
    const cookies: Record<string, string> = {};

    try {
        const raw = res.headers.get("set-cookie");

        for (const entry of typeof raw === "string" ? raw.split(/,(?=\s*[^;,=\s]+=)/) : []) {
            const pair = (entry.split(";")[0] ?? "").trim();
            const separator = pair.indexOf("=");
            if (separator > 0) cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
        }
    } catch {}

    return cookies;
}
