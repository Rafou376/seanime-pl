import { absUrl, chapterOrderValue, getAttrByClass, getLinkHrefByClass, getTextByClass, scriptContaining, stripTags } from "../../utils/html";

type SearchResponse = {
    total: number;
    offset: number;
    limit: number;
    list: SearchResponseItem[];
};

type SearchResponseItem = {
    name: string;
    picUrl?: string | null;
    elementId: { linkName: string };
};

const USER_HASH_RE = /user_hash.+'(.+)'/;
const EXTRA_RE = /\s*([0-9]+\sЭкстра)\s*/;
const SINGLE_RE = /\s*Сингл\s*/;
const PAGES_RE = /\[['"](.*?)['"],['"](.*?)['"],['"](.*?)['"].*?]/g;
const DATE_RE = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/;
const CHAPTER_ROW_RE = /<tr\b[^>]*\bclass=["'][^"']*\bitem-row\b[^"']*["'][^>]*>[\s\S]*?<\/tr>/gi;
const DATE_CELL_RE = /<td\b[^>]*\bclass=["'][^"']*\bd-none\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;
const READER_MARKS = ["rm_h.readerInit(", "rm_h.readerDoInit("];
const USER_AGENT = "arora";

export abstract class GroupLe {
    protected abstract readonly siteId: number;
    protected abstract readonly baseUrl: string;

    private userHash: string | null = null;
    private userHashRequest: Promise<string | null> | null = null;
    private cachedHtmlHeaders: Record<string, string> | null = null;
    private cachedApiHeaders: Record<string, string> | null = null;

    getSettings(): Settings {
        return { supportsMultiScanlator: true };
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = new URL(`${this.baseUrl}/api/catalog/search`);

        url.searchParams.set("offset", "0");
        url.searchParams.set("sortType", "RATING");

        if (opts.query) url.searchParams.set("q", opts.query);

        const json = await this.fetchJson<SearchResponse>(url.toString());
        if (!json) return [];

        return json.list.map((item) => ({
            id: item.elementId.linkName,
            title: item.name,
            image: item.picUrl ?? undefined,
        }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const html = await this.fetchHtml(`${this.baseUrl}/${id.replace(/^\/+/, "")}`);
        if (!html || html.includes("Запрещена публикация произведения по копирайту")) return [];

        const title = getTextByClass(html, "cr-hero-names__main") ?? "";
        const searchParams = this.chapterSearchParams(html);

        const chapters: Omit<ChapterDetails, "index">[] = [];

        for (const row of html.match(CHAPTER_ROW_RE) ?? []) {
            const href = getLinkHrefByClass(row, "chapter-link", "a");
            if (!href) continue;

            const rawNumber = getAttrByClass(row, "item-title", "data-num", "td");
            const chapterNumber = String(rawNumber ? parseFloat(rawNumber) / 10 : 0);

            const scanlator = this.scanlatorFromTitle(getAttrByClass(row, "chapter-link", "title", "a") ?? "");
            const name = this.cleanChapterName(stripTags(getTextByClass(row, "chapter-link", "a") ?? href), title, chapterNumber);

            const dateCells = [...row.matchAll(DATE_CELL_RE)].map((match) => stripTags(match[1]));
            const dateText = dateCells.length > 0 ? dateCells[dateCells.length - 1] : null;

            const chapterId = this.chapterId(href, searchParams);

            chapters.push({
                id: chapterId,
                url: absUrl(chapterId, this.baseUrl),
                title: name || `Глава ${chapterNumber}`,
                chapter: chapterNumber,
                scanlator: scanlator || undefined,
                updatedAt: this.parseChapterDate(dateText),
            });
        }

        return chapters
            .sort((a, b) => chapterOrderValue(a.chapter) - chapterOrderValue(b.chapter))
            .map((chapter, index) => ({ ...chapter, index }));
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

        let match: RegExpExecArray | null;
        PAGES_RE.lastIndex = 0;

        while ((match = PAGES_RE.exec(source)) !== null) {
            const [, host, middle, end] = match;
            if (!end) continue;

            let imageUrl: string;
            if (middle.trim().length === 0 && end.startsWith("/static/")) {
                imageUrl = this.baseUrl + end;
            } else if (middle.endsWith("/manga/")) {
                imageUrl = host + end;
            } else {
                imageUrl = middle + host + end;
            }

            if (!imageUrl.includes("://")) imageUrl = `https:${imageUrl}`;
            if (imageUrl.includes("one-way.work")) imageUrl = imageUrl.split("?")[0];
            imageUrl = imageUrl.replace("//resh", "//h");

            if (!/^https?:\/\//.test(imageUrl)) continue;

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
            } catch {
                value = rawId.trim();
            }
        }

        const url = new URL(/^https?:\/\//.test(value) ? value : `${this.baseUrl}/${value.replace(/^\/+/, "")}`);
        url.searchParams.set("mtr", "true");

        if (!url.searchParams.get("d")) {
            const hash = await this.resolveUserHash(url.pathname);
            if (hash) url.searchParams.set("d", hash);
        }

        return url.toString();
    }

    private resolveUserHash(pathname: string): Promise<string | null> {
        if (this.userHash) return Promise.resolve(this.userHash);
        if (this.userHashRequest) return this.userHashRequest;

        const slug = pathname.split("/").filter(Boolean)[0];
        if (!slug) return Promise.resolve(null);

        this.userHashRequest = this.fetchHtml(`${this.baseUrl}/${slug}`).then((html) => {
            this.userHash = html ? USER_HASH_RE.exec(html)?.[1] ?? null : null;
            return this.userHash;
        });

        return this.userHashRequest;
    }

    private chapterSearchParams(html: string): string {
        const hash = USER_HASH_RE.exec(html)?.[1] ?? null;
        if (hash) this.userHash = hash;

        return hash ? `?d=${hash}&mtr=true` : "?mtr=true";
    }

    private htmlHeaders(): Record<string, string> {
        return (this.cachedHtmlHeaders ??= {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru,en;q=0.9",
            "User-Agent": USER_AGENT,
            Referer: `${this.baseUrl}/`,
        });
    }

    private apiHeaders(): Record<string, string> {
        return (this.cachedApiHeaders ??= {
            Accept: "application/json, text/plain, */*",
            "User-Agent": USER_AGENT,
            "Site-Id": String(this.siteId),
        });
    }

    private async fetchHtml(url: string): Promise<string | null> {
        try {
            const res = await fetch(url, { headers: this.htmlHeaders() });
            return res.ok ? await res.text() : null;
        } catch {
            return null;
        }
    }

    private async fetchJson<T>(url: string): Promise<T | null> {
        try {
            const res = await fetch(url, { headers: this.apiHeaders() });
            return res.ok ? ((await res.json()) as T) : null;
        } catch {
            return null;
        }
    }

    private chapterId(href: string, searchParams: string): string {
        const path = href.startsWith("http") ? new URL(href).pathname : href;
        return `${path}${searchParams}`;
    }

    private scanlatorFromTitle(raw: string): string {
        if (!raw) return "";

        return raw
            .replace("(Переводчик),", "&")
            .replace("Переводчик,", "&")
            .replace(/\s*\(Переводчик\)\s*$/, "")
            .replace(/\s*Переводчик\s*$/, "")
            .trim();
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
        } else if (SINGLE_RE.test(name)) {
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

        const [, day, month, rawYear] = match;
        const year = rawYear.length === 2 ? 2000 + parseInt(rawYear, 10) : parseInt(rawYear, 10);
        const date = new Date(Date.UTC(year, parseInt(month, 10) - 1, parseInt(day, 10)));

        return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }
}
