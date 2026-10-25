import { getInputValue, getLinkHrefByClass } from "./html";
import { fetchForm, fetchText } from "./http";

export function parseDownloadForm(html: string, fallbackId: string | undefined, extraFields: string[] = []): Record<string, string> | null {
    const hash = getInputValue(html, "hash");
    const id = getInputValue(html, "id") || fallbackId;
    if (!hash || !id) return null;

    const fields: Record<string, string> = {
        op: getInputValue(html, "op") || "download_orig",
        id,
        mode: getInputValue(html, "mode") || "n",
        hash,
    };

    for (const name of extraFields) {
        const value = getInputValue(html, name);
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

    return result ? getLinkHrefByClass(result, linkClassName) : null;
}
