import { getAttrByClass, getBlocksByClass, getImageUrl, getLinkHrefByClass, getTextByClassPrefix } from "../../utils/html";

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

const MONTHS = [
    ["jan"],
    ["fev", "fév"],
    ["mar"],
    ["avr"],
    ["mai"],
    ["juin"],
    ["juil"],
    ["ao"],
    ["sep"],
    ["oct"],
    ["nov"],
    ["dec", "déc"],
];

export abstract class Origines {
    protected abstract readonly baseUrl: string;
    protected abstract readonly mangaPath: string;
    protected readonly legacyMangaPaths: string[] = [];

    getSettings(): Settings {
        return {};
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const body = `action=madara_child_search&term=${encodeURIComponent(opts.query)}`;
        const res = await this.postForm(`${this.baseUrl}/wp-admin/admin-ajax.php`, body);
        if (!res) return [];

        const json = JSON.parse(await res.text()) as SearchResponse;
        const items = Array.isArray(json.data) ? json.data : [];

        return items
            .filter((item) => item.title && item.url)
            .map((item) => ({
                id: this.toMangaSlug(item.url),
                title: item.title,
                image: item.thumb ? this.absUrl(item.thumb) : undefined,
            }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const res = await fetch(`${this.baseUrl}/${this.mangaPath}/${id}/`);
        if (!res.ok) return [];

        return this.parseChapters(await res.text(), id);
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const res = await fetch(`${this.baseUrl}/${this.mangaPath}/${id}/?style=list`);
        if (!res.ok) return [];

        return this.parsePages(await res.text());
    }

    private async postForm(url: string, body: string): Promise<Response | null> {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
        });
        return res.ok ? res : null;
    }

    private get knownPaths(): Set<string> {
        return new Set([...this.legacyMangaPaths, this.mangaPath]);
    }

    private splitSegments(path: string): string[] {
        return path
            .split("?")[0]
            .split("#")[0]
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

    private absUrl(url: string): string {
        try {
            return new URL(url, this.baseUrl).toString();
        } catch {
            return url;
        }
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
                url: this.absUrl(`${this.mangaPath}/${id}/`),
                title: name,
                chapter: this.chapterNumber(name),
                updatedAt: this.parseChapterDate(dateTitle),
            });
        }

        return chapters
            .sort((a, b) => this.chapterOrderValue(a.chapter) - this.chapterOrderValue(b.chapter))
            .map((chapter, index) => ({ ...chapter, index }));
    }

    private chapterOrderValue(chapter: string): number {
        const value = parseFloat(chapter);
        return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
    }

    private parsePages(chapterHtml: string): ChapterPage[] {
        const referer = `${this.baseUrl}/${this.mangaPath}/`;

        return getBlocksByClass(chapterHtml, "wp-manga-chapter-img", "img")
            .map((block) => getImageUrl(block)?.trim())
            .filter((url): url is string => !!url)
            .map((url, index) => ({
                url: this.absUrl(url),
                index,
                headers: { Referer: referer },
            }));
    }

    private chapterNumber(name: string): string {
        return name.match(/(\d+(?:\.\d+)?)/)?.[1] ?? name;
    }

    private parseChapterDate(date: string | null): string | undefined {
        if (!date) return undefined;

        const match = date.match(CHAPTER_DATE_RE);
        if (!match) return undefined;

        const [, day, monthLabel, year] = match;
        const month = this.monthNumber(monthLabel);
        if (month === undefined) return undefined;

        const now = new Date();
        const resolvedYear = year ? parseInt(year, 10) : now.getFullYear();
        let result = new Date(Date.UTC(resolvedYear, month, parseInt(day, 10)));

        if (!year && result.getTime() > now.getTime()) {
            result = new Date(Date.UTC(resolvedYear - 1, month, parseInt(day, 10)));
        }

        return result.toISOString();
    }

    private monthNumber(month: string): number | undefined {
        const name = month.toLowerCase();
        const index = MONTHS.findIndex((prefixes) => prefixes.some((prefix) => name.startsWith(prefix)));

        return index === -1 ? undefined : index;
    }
}
