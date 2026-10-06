import { utcIso } from "../../utils/dates";
import { absUrl, Anchor, getAnchors, getBlocksByClass, getFirstLink, getImageSource, getTextByClass, relativePath, stripTags } from "../../utils/html";
import { cookieHeader, parseSetCookie } from "../../utils/http";
import { matchChapterNumber, sortChapters } from "../provider-helpers";

type RelativeUnit = {
    words: string[];
    subtract: (date: Date, value: number) => void;
};

type Page = {
    html: string;
    cookies: Record<string, string>;
};

const IMG_ATTRS = ["data-original", "data-src", "data-lazy-src", "data-bg", "data-srcset", "data-lazy-srcset", "style", "src", "srcset"];

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const ABSOLUTE_DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const EXTENSION_RE = /\.[a-z]+$/i;
const TRAILING_NUMBER_RE = /(\d+(?:\.\d+)?)(?=\D*$)/;

const CHAPTER_NUMBER_RES = [/(?:\b(?:ch(?:apter)?|chap)\.?|第|#)\s*(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s*[話话章]/, /(\d+(?:\.\d+)?)/];

function subtractMonths(date: Date, months: number): void {
    const day = date.getUTCDate();

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
}

const RELATIVE_UNITS: RelativeUnit[] = [
    { words: ["min", "phút", "minuto", "dakika"], subtract: (date, value) => date.setUTCMinutes(date.getUTCMinutes() - value) },
    { words: ["hour", "giờ", "hora", "saat"], subtract: (date, value) => date.setUTCHours(date.getUTCHours() - value) },
    { words: ["day", "ngày", "día", "gün"], subtract: (date, value) => date.setUTCDate(date.getUTCDate() - value) },
    { words: ["week", "tuần", "semana", "hafta"], subtract: (date, value) => date.setUTCDate(date.getUTCDate() - value * 7) },
    { words: ["month", "tháng", "mes", "ay"], subtract: (date, value) => subtractMonths(date, value) },
    { words: ["year", "năm", "año", "yıl"], subtract: (date, value) => subtractMonths(date, value * 12) },
];

function matchesUnit(words: string[], word: string): boolean {
    return words.some((candidate) => (candidate.length > 2 ? word.startsWith(candidate) : word === candidate));
}

export abstract class FMReader {
    protected abstract readonly baseUrl: string;

    protected readonly requestPath: string = "manga-list.html";
    protected readonly cookies: Record<string, string> = {};

    protected readonly mangaListClass: string | null = null;
    protected readonly mangaCardClass: string = "media";
    protected readonly mangaTitleClass: string = "series-title";
    protected readonly mangaCoverClass: string = "img-in-ratio";

    protected readonly chapterListClass: string | null = "list-chapters";
    protected readonly chapterNameClass: string | null = null;
    protected readonly chapterTimeClass: string = "chapter-time";

    protected readonly dateValueIndex: number = 0;
    protected readonly dateWordIndex: number = 1;

    protected readonly pageImagePattern: RegExp = /\sclass\s*=\s*["'][^"']*\bchapter-img\b/i;
    protected readonly pageImageAttrs: string[] = IMG_ATTRS;

    getSettings(): Settings {
        return {};
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = this.searchUrl(opts.query);
        const html = await this.fetchHtml(url);

        return html ? this.parseSearch(html, url) : [];
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const pageUrl = this.absolute(id);
        const listUrl = this.chapterListUrl(id);
        const page = await this.fetchPage(pageUrl);

        if (listUrl === pageUrl) return page ? this.parseChapters(this.pageAnchors(page.html), pageUrl) : [];

        const list = await this.fetchPage(listUrl, { Referer: pageUrl }, page?.cookies);
        const fromList = list ? this.parseChapters(this.fragmentAnchors(list.html), listUrl) : [];
        if (fromList.length > 0 || !page) return fromList;

        return this.parseChapters(this.pageAnchors(page.html), pageUrl);
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const url = this.absolute(id);
        const html = await this.fetchHtml(url);

        return html ? this.parsePages(html, url) : [];
    }

    protected searchUrl(query: string): string {
        return `${this.baseUrl}/${this.requestPath}?name=${encodeURIComponent(query)}&page=1&author=&group=&m_status=&sort=views&genre=&ungenre=`;
    }

    protected chapterListUrl(id: string): string {
        return `${this.baseUrl}/${id}`;
    }

    protected chapterLinkBase(listUrl: string): string {
        return listUrl;
    }

    protected parseRelativeDate(text: string): string | undefined {
        const parts = text.trim().split(/\s+/);
        const word = parts[this.dateWordIndex]?.toLowerCase();
        const value = Number(parts[this.dateValueIndex]);
        if (!word || !Number.isInteger(value)) return undefined;

        const unit = RELATIVE_UNITS.find(({ words }) => matchesUnit(words, word));
        if (!unit) return undefined;

        const date = new Date();
        date.setUTCSeconds(0, 0);
        unit.subtract(date, value);

        return date.toISOString();
    }

    protected parseAbsoluteDate(text: string): string | undefined {
        const match = ABSOLUTE_DATE_RE.exec(text);
        if (!match) return undefined;

        const [, day = "", month = "", year = ""] = match;
        return utcIso(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    }

    private absolute(path: string): string {
        return absUrl(path, `${this.baseUrl}/`);
    }

    private buildHeaders(extra: Record<string, string> = {}, sessionCookies: Record<string, string> = {}): Record<string, string> {
        const cookie = cookieHeader({ ...this.cookies, ...sessionCookies });

        return cookie ? { Cookie: cookie, ...extra } : { ...extra };
    }

    private async fetchPage(url: string, extra: Record<string, string> = {}, sessionCookies: Record<string, string> = {}): Promise<Page | null> {
        try {
            const res = await fetch(url, { headers: this.buildHeaders(extra, sessionCookies) });
            if (!res.ok) {
                console.error(`[FMReader] ${res.status} ${url}`);
                return null;
            }

            return { html: await res.text(), cookies: { ...sessionCookies, ...parseSetCookie(res) } };
        } catch (error) {
            console.error(`[FMReader] ${url}`, error);
            return null;
        }
    }

    private async fetchHtml(url: string): Promise<string | null> {
        return (await this.fetchPage(url))?.html ?? null;
    }

    private resolve(url: string, pageUrl: string): string {
        return absUrl(url.trim(), pageUrl);
    }

    private scoped(html: string, className: string | null): string {
        return className ? getBlocksByClass(html, className).join("") : html;
    }

    private parseSearch(html: string, pageUrl: string): SearchResult[] {
        const results: SearchResult[] = [];

        for (const card of getBlocksByClass(this.scoped(html, this.mangaListClass), this.mangaCardClass)) {
            const titleBlock = getBlocksByClass(card, this.mangaTitleClass)[0];
            const link = titleBlock ? getFirstLink(titleBlock) : null;
            if (!link?.text) continue;

            results.push({
                id: relativePath(this.resolve(link.href, pageUrl)),
                title: link.text,
                image: this.coverUrl(card, pageUrl),
            });
        }

        return results;
    }

    private coverUrl(card: string, pageUrl: string): string | undefined {
        const cover = getBlocksByClass(card, this.mangaCoverClass)[0] ?? card.match(IMG_TAG_RE)?.[0];

        return cover ? this.imgAttr(cover, IMG_ATTRS, pageUrl) : undefined;
    }

    private pageAnchors(html: string): Anchor[] {
        return getAnchors(this.scoped(html, this.chapterListClass));
    }

    private fragmentAnchors(html: string): Anchor[] {
        const anchors = this.pageAnchors(html);
        if (anchors.length > 0 || this.chapterListClass === null) return anchors;

        const nameClass = this.chapterNameClass;

        return getAnchors(html).filter(({ content }) => !nameClass || getTextByClass(content, nameClass) !== null);
    }

    private parseChapters(anchors: Anchor[], pageUrl: string): ChapterDetails[] {
        const linkBase = this.chapterLinkBase(pageUrl);
        const chapters: Omit<ChapterDetails, "index">[] = [];
        const seen = new Set<string>();

        for (const { href, content } of anchors) {
            const id = relativePath(this.resolve(href, linkBase));
            if (!id || seen.has(id)) continue;
            seen.add(id);

            const name = this.chapterNameClass ? (getTextByClass(content, this.chapterNameClass) ?? "") : stripTags(content) || id;
            const chapter = this.chapterNumber(name, id);
            const time = getTextByClass(content, this.chapterTimeClass);

            chapters.push({
                id,
                url: this.absolute(id),
                title: name || `Chapter ${chapter}`,
                chapter,
                updatedAt: time ? (this.parseRelativeDate(time) ?? this.parseAbsoluteDate(time)) : undefined,
            });
        }

        return sortChapters(chapters);
    }

    private parsePages(html: string, pageUrl: string): ChapterPage[] {
        const headers = this.buildHeaders({ Referer: pageUrl });
        const pages: ChapterPage[] = [];

        for (const tag of html.match(IMG_TAG_RE) ?? []) {
            if (!this.pageImagePattern.test(tag)) continue;

            const url = this.imgAttr(tag, this.pageImageAttrs, pageUrl);
            if (url) pages.push({ url, index: pages.length, headers });
        }

        return pages;
    }

    private imgAttr(element: string, attrs: string[], pageUrl: string): string | undefined {
        const url = getImageSource(element, attrs);

        return url ? this.resolve(url, pageUrl) : undefined;
    }

    private chapterNumber(name: string, id: string): string {
        const patterns = name ? CHAPTER_NUMBER_RES : [TRAILING_NUMBER_RE];
        const source = name || (id.split(/[?#]/)[0] ?? "").replace(EXTENSION_RE, "");

        return matchChapterNumber(source, patterns) ?? (name || id);
    }
}
