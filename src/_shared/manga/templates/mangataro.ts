import { WEBSITE } from "virtual:website";
import { absUrl, decodeEntities } from "../../utils/html";
import { fetchJson, parseJson } from "../../utils/http";
import { md5 } from "../../utils/md5";
import { sortChapters } from "../provider-helpers";

type SearchManga = {
    id: number;
    slug: string;
    title: string;
    thumbnail?: string | null;
    type: string;
};

type SearchResponse = {
    results?: SearchManga[];
};

type ChapterEntry = {
    url: string;
    chapter: string;
    title?: string | null;
    date?: string | null;
    group_name?: string | null;
    language: string;
};

type ChapterListResponse = {
    chapters?: ChapterEntry[];
    has_more?: boolean;
};

type PagesResponse = {
    images?: string[];
};

type ChapterPageRequest = {
    status: number;
    data: ChapterListResponse | null;
    serverTime: number | null;
};

const SEARCH_LIMIT = 25;
const CHAPTERS_LIMIT = 500;
const PLACEHOLDERS = new Set(["N/A", "\u2014"]);
const RELATIVE_DATE_RE = /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i;
const CHAPTER_ID_RE = /([^/-]+)$/;

function unescapeHtml(text: string): string {
    let decoded = text;

    for (let i = 0; i < 5; i++) {
        const next = decodeEntities(decoded);
        if (next === decoded) break;
        decoded = next;
    }

    return decoded;
}

function cleanText(value?: string | null): string | undefined {
    const text = value?.trim();

    return !text || PLACEHOLDERS.has(text.toUpperCase()) ? undefined : unescapeHtml(text);
}

function parseRelativeDate(text?: string | null): string | undefined {
    const match = RELATIVE_DATE_RE.exec(text?.trim() ?? "");
    if (!match) return undefined;

    const amount = parseInt(match[1] ?? "0", 10);
    const date = new Date();

    switch ((match[2] ?? "").toLowerCase()) {
        case "second":
            date.setSeconds(date.getSeconds() - amount);
            break;
        case "minute":
            date.setMinutes(date.getMinutes() - amount);
            break;
        case "hour":
            date.setHours(date.getHours() - amount);
            break;
        case "day":
            date.setDate(date.getDate() - amount);
            break;
        case "week":
            date.setDate(date.getDate() - amount * 7);
            break;
        case "month":
            date.setMonth(date.getMonth() - amount);
            break;
        case "year":
            date.setFullYear(date.getFullYear() - amount);
            break;
    }

    return date.toISOString();
}

function chapterIdFromUrl(url: string): string | null {
    const clean = (url.split("#")[0] ?? "").split("?")[0] ?? "";

    return CHAPTER_ID_RE.exec(clean.replace(/\/+$/, ""))?.[1] ?? null;
}

export abstract class MangaTaro implements MangaProvider {
    protected abstract readonly language: string;

    private serverTimeOffset = 0;

    getSettings(): Settings {
        return { supportsMultiScanlator: true };
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const json = await fetchJson<SearchResponse>(`${WEBSITE}/auth/search`, {
            method: "POST",
            headers: { ...this.headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ query: opts.query.trim(), limit: SEARCH_LIMIT }),
        });

        return (json?.results ?? [])
            .filter((manga) => manga.type !== "Novel")
            .map((manga) => ({
                id: String(manga.id),
                title: unescapeHtml(manga.title),
                image: manga.thumbnail || undefined,
            }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const entries: ChapterEntry[] = [];

        let page = await this.fetchChapterPage(id, 0);

        while (page) {
            const batch = page.chapters ?? [];
            entries.push(...batch);

            if (!page.has_more || batch.length === 0) break;

            page = await this.fetchChapterPage(id, entries.length);
        }

        const chapters = entries
            .filter((entry) => entry.language.toLowerCase() === this.language.toLowerCase())
            .flatMap((entry) => {
                const details = this.toChapterDetails(entry);

                return details ? [details] : [];
            });

        return sortChapters(chapters);
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const json = await fetchJson<PagesResponse>(`${WEBSITE}/auth/chapter-content?chapter_id=${encodeURIComponent(id)}`, {
            headers: this.headers(),
        });

        return (json?.images ?? []).map((url, index) => ({
            url,
            index,
            headers: { Referer: `${WEBSITE}/` },
        }));
    }

    private toChapterDetails(entry: ChapterEntry): Omit<ChapterDetails, "index"> | null {
        const url = absUrl(entry.url.replace(/\/+$/, ""), WEBSITE);
        const id = chapterIdFromUrl(url);
        if (!id) return null;

        const number = String(entry.chapter);
        const title = cleanText(entry.title);

        return {
            id,
            url,
            title: title ? `Chapter ${number}: ${title}` : `Chapter ${number}`,
            chapter: number,
            scanlator: cleanText(entry.group_name),
            language: this.language,
            updatedAt: parseRelativeDate(entry.date),
        };
    }

    private chapterListUrl(mangaId: string, offset: number): string {
        const now = Date.now() + this.serverTimeOffset;
        const epochSecond = Math.floor(now / 1000);
        const iso = new Date(now).toISOString();
        const hour = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10) + iso.slice(11, 13);
        const token = md5(`${epochSecond}mng_ch_${hour}`).substring(0, 16);

        const params = new URLSearchParams({
            manga_id: mangaId,
            offset: String(offset),
            limit: String(CHAPTERS_LIMIT),
            order: "DESC",
            _t: token,
            _ts: String(epochSecond),
        });

        return `${WEBSITE}/auth/manga-chapters?${params.toString()}`;
    }

    private async requestChapterPage(mangaId: string, offset: number): Promise<ChapterPageRequest> {
        try {
            const res = await fetch(this.chapterListUrl(mangaId, offset), { headers: this.headers() });

            if (!res.ok) {
                const serverTime = Date.parse(res.headers.get("date") ?? "");

                return { status: res.status, data: null, serverTime: Number.isNaN(serverTime) ? null : serverTime };
            }

            return { status: res.status, data: parseJson<ChapterListResponse>(await res.text()), serverTime: null };
        } catch {
            return { status: 0, data: null, serverTime: null };
        }
    }

    private async fetchChapterPage(mangaId: string, offset: number): Promise<ChapterListResponse | null> {
        const first = await this.requestChapterPage(mangaId, offset);
        if (first.status !== 403) return first.data;
        if (first.serverTime === null) return null;

        this.serverTimeOffset = first.serverTime - Date.now();

        return (await this.requestChapterPage(mangaId, offset)).data;
    }

    private headers(): Record<string, string> {
        return {
            Accept: "application/json",
            Referer: `${WEBSITE}/`,
        };
    }
}
