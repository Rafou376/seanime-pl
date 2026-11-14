import { WEBSITE } from "virtual:website";
import { utcIso } from "../../core/dates";
import { getImageUrl, getTextByClassPrefix } from "../../core/html";
import { fetchForm, fetchText } from "../../core/http";
import { parseJson } from "../../core/json";
import { absUrl, relativePath } from "../../core/url";
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

const DIACRITICS_RE = /\p{M}/gu;

const MONTHS = ["jan", "fev", "mar", "avr", "mai", "juin", "juil", "ao", "sep", "oct", "nov", "dec"];

function pathSegments(path: string): string[] {
    return (path.split(/[?#]/, 1)[0] ?? "").split("/").filter((segment) => segment.length > 0);
}

function monthIndex(month: string): number | undefined {
    const name = month.toLowerCase().normalize("NFD").replace(DIACRITICS_RE, "");
    const index = MONTHS.findIndex((prefix) => name.startsWith(prefix));

    return index === -1 ? undefined : index;
}

export abstract class Origines implements MangaProvider {
    protected abstract readonly mangaPath: string;
    protected readonly legacyMangaPaths: string[] = [];

    getSettings(): Settings {
        return {};
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const text = await fetchForm(`${WEBSITE}/wp-admin/admin-ajax.php`, { action: "madara_child_search", term: opts.query });
        const data = text ? parseJson<SearchResponse>(text)?.data : undefined;
        const items = Array.isArray(data) ? data : [];

        return items
            .filter((item) => item.title && item.url)
            .map((item) => ({
                id: this.toMangaSlug(item.url),
                title: item.title,
                image: item.thumb ? absUrl(item.thumb, WEBSITE) : undefined,
            }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const html = await fetchText(`${WEBSITE}/${this.mangaPath}/${id}/`);

        return html ? this.parseChapters(html, id) : [];
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const html = await fetchText(`${WEBSITE}/${this.mangaPath}/${id}/?style=list`);

        return html ? this.parsePages(html) : [];
    }

    private toMangaSlug(path: string): string {
        return pathSegments(relativePath(path)).find((segment) => segment !== this.mangaPath && !this.legacyMangaPaths.includes(segment)) ?? path;
    }

    private parseChapters(html: string, mangaId: string): ChapterDetails[] {
        const chapters: Omit<ChapterDetails, "index">[] = [];

        LoadDoc(html)("div.ori-chl-row").each((_, block) => {
            const href = block.find("a.ori-chl-corps[href]").first().attr("href");
            if (!href) return;

            const chapterSlug = pathSegments(href).pop();
            if (!chapterSlug) return;

            const id = `${mangaId}/${chapterSlug}`;
            const name = getTextByClassPrefix(block, "ori-chl-nom") ?? getTextByClassPrefix(block, "ori-chl") ?? id;
            const dateTitle = block.find("span.ori-chl-date[title]").first().attr("title");

            chapters.push({
                id,
                url: absUrl(`${this.mangaPath}/${id}/`, WEBSITE),
                title: name,
                chapter: matchChapterNumber(name) ?? name,
                updatedAt: this.parseChapterDate(dateTitle),
            });
        });

        return sortChapters(chapters);
    }

    private parsePages(chapterHtml: string): ChapterPage[] {
        const referer = `${WEBSITE}/${this.mangaPath}/`;
        const pages: ChapterPage[] = [];

        LoadDoc(chapterHtml)("img.wp-manga-chapter-img").each((_, img) => {
            const url = getImageUrl(img)?.trim();
            if (!url) return;

            pages.push({ url: absUrl(url, WEBSITE), index: pages.length, headers: { Referer: referer } });
        });

        return pages;
    }

    private parseChapterDate(date: string | undefined): string | undefined {
        if (!date) return undefined;

        const match = date.match(CHAPTER_DATE_RE);
        if (!match) return undefined;

        const [, day = "", monthLabel = "", year = ""] = match;
        const month = monthIndex(monthLabel);
        if (month === undefined) return undefined;

        const dayNumber = parseInt(day, 10);
        const now = new Date();
        let resolvedYear = year ? parseInt(year, 10) : now.getUTCFullYear();

        if (!year && Date.UTC(resolvedYear, month, dayNumber) > now.getTime()) resolvedYear -= 1;

        return utcIso(resolvedYear, month, dayNumber);
    }
}
