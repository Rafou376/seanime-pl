import { parseJson } from "../json";

export async function fetchResponse(url: string, init?: RequestInit): Promise<Response | null> {
    try {
        const res = init ? await fetch(url, init) : await fetch(url);
        return res.ok ? res : null;
    } catch {
        return null;
    }
}

export async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
    try {
        const res = await fetchResponse(url, init);
        return res ? await res.text() : null;
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
