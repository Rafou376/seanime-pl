import { WEBSITE } from "virtual:website";
import { memoizeAsync } from "../../core/cache";
import { utcIso } from "../../core/dates";
import { getText, scriptContaining } from "../../core/html";
import { fetchJson, fetchText } from "../../core/http";
import { absUrl, isAbsoluteUrl, pathOf, queryParam, trimLeadingSlashes, withQuery } from "../../core/url";
import { sortChapters } from "../provider-helpers";

type SearchResponse = {
    total: number;
    offset: number;
    limit: number;
    list?: SearchResponseItem[];
};

type SearchResponseItem = {
    name: string;
    picUrl?: string | null;
    elementId: { linkName: string };
};

const USER_HASH_RE = /user_hash["']?\s*[:=]\s*["']([^"']+)["']/;
const EXTRA_RE = /[0-9]+\sЭкстра/;
const PAGES_RE = /\[['"](.*?)['"],['"](.*?)['"],['"](.*?)['"].*?]/g;
const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/;
const READER_MARKS = ["rm_h.readerInit(", "rm_h.readerDoInit("];
const USER_AGENT = "arora";

function extractUserHash(html: string): string | null {
    return USER_HASH_RE.exec(html)?.[1] ?? null;
}

export abstract class GroupLe implements MangaProvider {
    protected abstract readonly siteId: number;

    private userHash: string | null = null;
    private readonly loadUserHash = memoizeAsync(async (slug: string) => {
        const html = await this.fetchHtml(`${WEBSITE}/${slug}`);

        return html ? extractUserHash(html) : null;
    });

    getSettings(): Settings {
        return { supportsMultiScanlator: true };
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = withQuery(`${WEBSITE}/api/catalog/search`, {
            offset: "0",
            sortType: "RATING",
            ...(opts.query ? { q: opts.query } : {}),
        });

        const json = await fetchJson<SearchResponse>(url, { headers: this.apiHeaders() });

        return (json?.list ?? []).map((item) => ({
            id: item.elementId.linkName,
            title: item.name,
            image: item.picUrl ?? undefined,
        }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const html = await this.fetchHtml(`${WEBSITE}/${trimLeadingSlashes(id)}`);
        if (!html || html.includes("Запрещена публикация произведения по копирайту")) return [];

        const $ = LoadDoc(html);
        const title = getText($(".cr-hero-names__main").first());
        const searchParams = this.chapterSearchParams(html);

        const chapters: Omit<ChapterDetails, "index">[] = [];

        $("tr.item-row").each((_, row) => {
            const href = row.find("a.chapter-link[href]").first().attr("href");
            if (!href) return;

            const parsedNumber = parseFloat(row.find("td.item-title[data-num]").first().attr("data-num") ?? "");
            const chapterNumber = String(Number.isFinite(parsedNumber) ? parsedNumber / 10 : 0);

            const scanlator = this.scanlatorFromTitle(row.find("a.chapter-link[title]").first().attr("title"));
            const name = this.cleanChapterName(getText(row.find("a.chapter-link").first()) || href, title, chapterNumber);

            const chapterId = `${isAbsoluteUrl(href) ? pathOf(href) : href}${searchParams}`;

            chapters.push({
                id: chapterId,
                url: absUrl(chapterId, WEBSITE),
                title: name || `Глава ${chapterNumber}`,
                chapter: chapterNumber,
                scanlator,
                updatedAt: this.parseChapterDate(getText(row.find("td.d-none").last())),
            });
        });

        return sortChapters(chapters);
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const url = await this.chapterUrl(id);

        const html = await this.fetchHtml(url);
        if (!html) return [];

        const script = scriptContaining(html, "chapterInfo");
        if (!script) return [];

        const mark = READER_MARKS.find((value) => script.includes(value));
        if (!mark) return [];

        const beginIndex = script.indexOf(mark);
        const endIndex = script.indexOf(");", beginIndex);
        const trimmed = script.slice(beginIndex, endIndex === -1 ? undefined : endIndex);

        const pages = this.parsePages(trimmed, url);
        return pages.length > 0 ? pages : this.parsePages(script, url);
    }

    private parsePages(source: string, referer: string): ChapterPage[] {
        const pages: ChapterPage[] = [];

        for (const match of source.matchAll(PAGES_RE)) {
            const [, host = "", middle = "", end = ""] = match;
            if (!end) continue;

            let imageUrl: string;
            if (middle.trim().length === 0 && end.startsWith("/static/")) {
                imageUrl = WEBSITE + end;
            } else if (middle.endsWith("/manga/")) {
                imageUrl = host + end;
            } else {
                imageUrl = middle + host + end;
            }

            if (!imageUrl.includes("://")) imageUrl = `https:${imageUrl}`;
            if (imageUrl.includes("one-way.work")) imageUrl = imageUrl.split("?")[0] ?? imageUrl;
            imageUrl = imageUrl.replace("//resh", "//h");

            if (!isAbsoluteUrl(imageUrl)) continue;

            pages.push({
                url: imageUrl,
                index: pages.length,
                headers: { Referer: referer, "User-Agent": USER_AGENT },
            });
        }

        return pages;
    }

    private async chapterUrl(rawId: string): Promise<string> {
        let value = rawId.trim();

        if (!value.includes("?") && value.includes("%3F")) {
            try {
                value = decodeURIComponent(value);
            } catch {}
        }

        const url = isAbsoluteUrl(value) ? value : `${WEBSITE}/${trimLeadingSlashes(value)}`;
        const hash = queryParam(url, "d") || (await this.resolveUserHash(pathOf(url)));

        return withQuery(url, { mtr: "true", ...(hash ? { d: hash } : {}) });
    }

    private resolveUserHash(pathname: string): Promise<string | null> {
        if (this.userHash) return Promise.resolve(this.userHash);

        const slug = pathname.split("/").filter(Boolean)[0];
        if (!slug) return Promise.resolve(null);

        return this.loadUserHash(slug);
    }

    private chapterSearchParams(html: string): string {
        const hash = extractUserHash(html);
        if (hash) this.userHash = hash;

        return hash ? `?d=${hash}&mtr=true` : "?mtr=true";
    }

    private htmlHeaders(): Record<string, string> {
        return {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru,en;q=0.9",
            "User-Agent": USER_AGENT,
            Referer: `${WEBSITE}/`,
        };
    }

    private apiHeaders(): Record<string, string> {
        return {
            Accept: "application/json, text/plain, */*",
            "User-Agent": USER_AGENT,
            "Site-Id": String(this.siteId),
        };
    }

    private fetchHtml(url: string): Promise<string | null> {
        return fetchText(url, { headers: this.htmlHeaders() });
    }

    private scanlatorFromTitle(raw: string | undefined): string | undefined {
        if (!raw) return undefined;

        const scanlator = raw
            .replace(/\(Переводчик\),/g, "&")
            .replace(/Переводчик,/g, "&")
            .replace(/\s*\(Переводчик\)\s*$/, "")
            .replace(/\s*Переводчик\s*$/, "")
            .trim();

        return scanlator || undefined;
    }

    private cleanChapterName(rawName: string, mangaTitle: string, chapterNumber: string): string {
        let name = rawName.trim();

        if (mangaTitle.length > 25) {
            for (const word of mangaTitle.split(" ")) {
                if (word && name.startsWith(word)) name = name.slice(word.length).trim();
            }
        }

        const dots = name.indexOf("…");
        const numbers = name.search(/[0-9]/);
        if (dots !== -1 && dots < (numbers === -1 ? Infinity : numbers)) {
            name = name.slice(dots + 1).trim();
        }

        if (EXTRA_RE.test(name)) {
            if (name.split("Экстра")[1]?.trim() === "") {
                name = name.replace(" ", ` - ${chapterNumber} `);
            }
        } else if (name.includes("Сингл")) {
            if (name.split("Сингл")[1]?.trim() === "") {
                name = `${chapterNumber} ${name}`;
            }
        }

        return name;
    }

    private parseChapterDate(text: string | null): string | undefined {
        if (!text) return undefined;

        const match = DATE_RE.exec(text.trim());
        if (!match) return undefined;

        const [, day = "", month = "", rawYear = ""] = match;
        const year = rawYear.length === 2 ? 2000 + parseInt(rawYear, 10) : parseInt(rawYear, 10);
        return utcIso(year, parseInt(month, 10) - 1, parseInt(day, 10));
    }
}
