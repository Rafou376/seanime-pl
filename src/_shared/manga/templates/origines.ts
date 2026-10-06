import { utcIso } from "../../utils/dates";
import { absUrl, getAttrByClass, getBlocksByClass, getImageUrl, getLinkHrefByClass, getTextByClassPrefix } from "../../utils/html";
import { fetchForm, fetchText, parseJson } from "../../utils/http";
import { matchChapterNumber, sortChapters } from "../provider-helpers";

type SearchResponse = {
    success: boolean;
    data: SearchResultItem[] | Record<string, never>;
};

type SearchResultItem = {
    title: string;
    url: string;
    thumb?: string;
};

const CHAPTER_DATE_RE = /(\d{1,2})\s+(\p{L}+)\.?(?:\s+(\d{4}))?/u;

const MONTHS = ["jan", "fev", "mar", "avr", "mai", "juin", "juil", "ao", "sep", "oct", "nov", "dec"];

export abstract class Origines {
    protected abstract readonly baseUrl: string;
    protected abstract readonly mangaPath: string;
    protected readonly legacyMangaPaths: string[] = [];

    private knownPathsCache: Set<string> | null = null;

    getSettings(): Settings {
        return {};
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const text = await fetchForm(`${this.baseUrl}/wp-admin/admin-ajax.php`, { action: "madara_child_search", term: opts.query });
        const data = text ? parseJson<SearchResponse>(text)?.data : undefined;
        const items = Array.isArray(data) ? data : [];

        return items
            .filter((item) => item.title && item.url)
            .map((item) => ({
                id: this.toMangaSlug(item.url),
                title: item.title,
                image: item.thumb ? absUrl(item.thumb, this.baseUrl) : undefined,
            }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const html = await fetchText(`${this.baseUrl}/${this.mangaPath}/${id}/`);

        return html ? this.parseChapters(html, id) : [];
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const html = await fetchText(`${this.baseUrl}/${this.mangaPath}/${id}/?style=list`);

        return html ? this.parsePages(html) : [];
    }

    private get knownPaths(): Set<string> {
        return (this.knownPathsCache ??= new Set([...this.legacyMangaPaths, this.mangaPath]));
    }

    private splitSegments(path: string): string[] {
        return path
            .split(/[?#]/, 1)[0]!
            .split("/")
            .filter((segment) => segment.length > 0);
    }

    private pathSegments(path: string): string[] {
        const known = this.knownPaths;
        const cleanPath = path.startsWith("http") ? new URL(path).pathname : path;

        return this.splitSegments(cleanPath).filter((segment) => !known.has(segment));
    }

    private toMangaSlug(path: string): string {
        return this.pathSegments(path)[0] ?? path;
    }

    private lastPathSegment(path: string): string | undefined {
        return this.splitSegments(path).pop();
    }

    private parseChapters(html: string, mangaId: string): ChapterDetails[] {
        const chapters: Omit<ChapterDetails, "index">[] = [];

        for (const block of getBlocksByClass(html, "ori-chl-row", "div")) {
            const href = getLinkHrefByClass(block, "ori-chl-corps");
            if (!href) continue;

            const chapterSlug = this.lastPathSegment(href);
            if (!chapterSlug) continue;

            const id = `${mangaId}/${chapterSlug}`;
            const name = getTextByClassPrefix(block, "ori-chl-nom") ?? getTextByClassPrefix(block, "ori-chl") ?? id;
            const dateTitle = getAttrByClass(block, "ori-chl-date", "title", "span");

            chapters.push({
                id,
                url: absUrl(`${this.mangaPath}/${id}/`, this.baseUrl),
                title: name,
                chapter: matchChapterNumber(name) ?? name,
                updatedAt: this.parseChapterDate(dateTitle),
            });
        }

        return sortChapters(chapters);
    }

    private parsePages(chapterHtml: string): ChapterPage[] {
        const referer = `${this.baseUrl}/${this.mangaPath}/`;

        return getBlocksByClass(chapterHtml, "wp-manga-chapter-img", "img")
            .map((block) => getImageUrl(block)?.trim())
            .filter((url): url is string => !!url)
            .map((url, index) => ({
                url: absUrl(url, this.baseUrl),
                index,
                headers: { Referer: referer },
            }));
    }

    private parseChapterDate(date: string | null): string | undefined {
        if (!date) return undefined;

        const match = date.match(CHAPTER_DATE_RE);
        if (!match) return undefined;

        const [, day = "", monthLabel = "", year = ""] = match;
        const month = this.monthNumber(monthLabel);
        if (month === undefined) return undefined;

        const dayNumber = parseInt(day, 10);
        const now = new Date();
        let resolvedYear = year ? parseInt(year, 10) : now.getUTCFullYear();

        if (!year && Date.UTC(resolvedYear, month, dayNumber) > now.getTime()) resolvedYear -= 1;

        return utcIso(resolvedYear, month, dayNumber);
    }

    private monthNumber(month: string): number | undefined {
        const name = month.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
        const index = MONTHS.findIndex((prefix) => name.startsWith(prefix));

        return index === -1 ? undefined : index;
    }
}
