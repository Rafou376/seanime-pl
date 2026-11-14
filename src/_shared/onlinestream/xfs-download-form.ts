import { fetchForm, fetchText } from "../core/http";

export function parseDownloadForm(html: string, fallbackId: string | undefined, extraFields: string[] = []): Record<string, string> | null {
    const $ = LoadDoc(html);
    const inputValue = (name: string): string | undefined => $(`input[name="${name}"][value]`).first().attr("value");

    const hash = inputValue("hash");
    const id = inputValue("id") || fallbackId;
    if (!hash || !id) return null;

    const fields: Record<string, string> = {
        op: inputValue("op") || "download_orig",
        id,
        mode: inputValue("mode") || "n",
        hash,
    };

    for (const name of extraFields) {
        const value = inputValue(name);
        if (value) fields[name] = value;
    }

    return fields;
}

export async function fetchDirectDownloadUrl(formUrl: string, videoId: string, linkClassName: string, extraFields: string[] = []): Promise<string | null> {
    const html = await fetchText(formUrl);
    if (!html) return null;

    const fields = parseDownloadForm(html, videoId, extraFields);
    if (!fields) return null;

    const result = await fetchForm(formUrl, fields);

    return result ? (LoadDoc(result)(`a.${linkClassName}[href]`).first().attr("href") ?? null) : null;
}
