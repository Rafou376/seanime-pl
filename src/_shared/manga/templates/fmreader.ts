import { WEBSITE } from "virtual:website";
import { relativeDateIso, utcIso } from "../../core/dates";
import { getImageSource, getText, toArray } from "../../core/html";
import { cookieHeader, fetchResponse } from "../../core/http";
import { absUrl, relativePath } from "../../core/url";
import { ANY_NUMBER_RE, matchChapterNumber, sortChapters } from "../provider-helpers";

type Page = {
    html: string;
    cookies: Record<string, string>;
};

const IMG_ATTRS = ["data-original", "data-src", "data-lazy-src", "data-bg", "data-srcset", "data-lazy-srcset", "style", "src", "srcset"];

const ABSOLUTE_DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const EXTENSION_RE = /\.[a-z]+$/i;
const TRAILING_NUMBER_RE = /(\d+(?:\.\d+)?)(?=\D*$)/;

const CHAPTER_NUMBER_RES = [/(?:\bch(?:ap(?:ter)?)?\.?|第|#)\s*(\d+(?:\.\d+)?)/i, /(\d+(?:\.\d+)?)\s*[話话章]/, ANY_NUMBER_RE];

export abstract class FMReader implements MangaProvider {
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

    protected readonly pageImageSelector: string = "img.chapter-img";
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
        return `${WEBSITE}/${this.requestPath}?name=${encodeURIComponent(query)}&page=1&author=&group=&m_status=&sort=views&genre=&ungenre=`;
    }

    protected chapterListUrl(id: string): string {
        return `${WEBSITE}/${id}`;
    }

    protected chapterLinkBase(listUrl: string): string {
        return listUrl;
    }

    protected parseRelativeDate(text: string): string | undefined {
        const parts = text.trim().split(/\s+/);
        const word = parts[this.dateWordIndex];
        const value = Number(parts[this.dateValueIndex]);

        return word && Number.isInteger(value) ? relativeDateIso(value, word) : undefined;
    }

    protected parseAbsoluteDate(text: string): string | undefined {
        const match = ABSOLUTE_DATE_RE.exec(text);
        if (!match) return undefined;

        const [, day = "", month = "", year = ""] = match;
        return utcIso(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    }

    private absolute(path: string): string {
        return absUrl(path, `${WEBSITE}/`);
    }

    private buildHeaders(extra: Record<string, string> = {}, sessionCookies: Record<string, string> = {}): Record<string, string> {
        const cookie = cookieHeader({ ...this.cookies, ...sessionCookies });

        return cookie ? { Cookie: cookie, ...extra } : { ...extra };
    }

    private async fetchPage(url: string, extra: Record<string, string> = {}, sessionCookies: Record<string, string> = {}): Promise<Page | null> {
        const res = await fetchResponse(url, { headers: this.buildHeaders(extra, sessionCookies) });
        if (!res) return null;

        try {
            return { html: res.text(), cookies: { ...sessionCookies, ...res.cookies } };
        } catch {
            return null;
        }
    }

    private async fetchHtml(url: string): Promise<string | null> {
        return (await this.fetchPage(url))?.html ?? null;
    }

    private resolve(url: string, pageUrl: string): string {
        return absUrl(url.trim(), pageUrl);
    }

    private within(className: string | null): string {
        return className ? `.${className} ` : "";
    }

    private parseSearch(html: string, pageUrl: string): SearchResult[] {
        const results: SearchResult[] = [];

        LoadDoc(html)(`${this.within(this.mangaListClass)}.${this.mangaCardClass}`).each((_, card) => {
            const link = card.find(`.${this.mangaTitleClass} a[href], a.${this.mangaTitleClass}[href]`).first();
            const title = getText(link);
            const href = link.attr("href");
            if (!title || href === undefined) return;

            results.push({
                id: relativePath(this.resolve(href, pageUrl)),
                title,
                image: this.coverUrl(card, pageUrl),
            });
        });

        return results;
    }

    private coverUrl(card: DocSelection, pageUrl: string): string | undefined {
        const block = card.find(`.${this.mangaCoverClass}`).first();
        const cover = block.length() > 0 ? block : card.find("img").first();

        return cover.length() > 0 ? this.imgAttr(cover, IMG_ATTRS, pageUrl) : undefined;
    }

    private pageAnchors(html: string): DocSelection[] {
        return toArray(LoadDoc(html)(`${this.within(this.chapterListClass)}a[href]`));
    }

    private fragmentAnchors(html: string): DocSelection[] {
        const anchors = this.pageAnchors(html);
        if (anchors.length > 0 || this.chapterListClass === null) return anchors;

        const nameClass = this.chapterNameClass;

        return toArray(LoadDoc(html)("a[href]"))
            .filter((anchor) => !nameClass || getText(anchor.find(`.${nameClass}`).first()) !== "");
    }

    private parseChapters(anchors: DocSelection[], pageUrl: string): ChapterDetails[] {
        const linkBase = this.chapterLinkBase(pageUrl);
        const chapters: Omit<ChapterDetails, "index">[] = [];
        const seen = new Set<string>();

        for (const anchor of anchors) {
            const id = relativePath(this.resolve(anchor.attr("href") ?? "", linkBase));
            if (!id || seen.has(id)) continue;
            seen.add(id);

            const name = this.chapterNameClass ? getText(anchor.find(`.${this.chapterNameClass}`).first()) : getText(anchor) || id;
            const chapter = this.chapterNumber(name, id);
            const time = getText(anchor.find(`.${this.chapterTimeClass}`).first());

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

        LoadDoc(html)(this.pageImageSelector).each((_, img) => {
            const url = this.imgAttr(img, this.pageImageAttrs, pageUrl);
            if (url) pages.push({ url, index: pages.length, headers });
        });

        return pages;
    }

    private imgAttr(element: DocSelection, attrs: string[], pageUrl: string): string | undefined {
        const url = getImageSource(element, attrs);

        return url ? this.resolve(url, pageUrl) : undefined;
    }

    private chapterNumber(name: string, id: string): string {
        const patterns = name ? CHAPTER_NUMBER_RES : [TRAILING_NUMBER_RE];
        const source = name || (id.split(/[?#]/)[0] ?? "").replace(EXTENSION_RE, "");

        return matchChapterNumber(source, patterns) ?? (name || id);
    }
}
