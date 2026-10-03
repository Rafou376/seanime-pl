export function cookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
}

export function parseSetCookie(res: { headers: { get(name: string): string | null } }): Record<string, string> {
    const cookies: Record<string, string> = {};

    try {
        const raw = res.headers.get("set-cookie");
        if (typeof raw !== "string") return cookies;

        for (const entry of raw.split(/,(?=\s*[^;,=\s]+=)/)) {
            const pair = entry.split(";")[0].trim();
            const separator = pair.indexOf("=");
            if (separator > 0) cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
        }
    } catch {
        return cookies;
    }

    return cookies;
}

export function parseJson<T>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

export async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
    try {
        const res = init ? await fetch(url, init) : await fetch(url);
        return res.ok ? await res.text() : null;
    } catch {
        return null;
    }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
    const text = await fetchText(url, init);

    return text === null ? null : parseJson<T>(text);
}

export function fetchForm(url: string, fields: Record<string, string>, headers: Record<string, string> = {}): Promise<string | null> {
    return fetchText(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body: new URLSearchParams(fields).toString(),
    });
}
