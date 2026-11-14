export async function fetchResponse(url: string, options?: FetchOptions): Promise<FetchResponse | null> {
    try {
        const res = options ? await fetch(url, options) : await fetch(url);
        return res.ok ? res : null;
    } catch {
        return null;
    }
}

export async function fetchText(url: string, options?: FetchOptions): Promise<string | null> {
    try {
        const res = await fetchResponse(url, options);
        return res ? res.text() : null;
    } catch {
        return null;
    }
}

export async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T | null> {
    try {
        const res = await fetchResponse(url, options);
        return res ? res.json<T>() : null;
    } catch {
        return null;
    }
}

export function fetchForm(url: string, fields: Record<string, string>, headers: Record<string, string> = {}): Promise<string | null> {
    return fetchText(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body: new URLSearchParams(fields).toString(),
    });
}
