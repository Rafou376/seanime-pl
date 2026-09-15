type MangaShort = {
    name: string;
    rus_name?: string | null;
    slug_url: string;
    cover: { default?: string | null };
};

type MangasPage = {
    data: MangaShort[];
};

type ChapterBranch = {
    branch_id: number | null;
    created_at: string;
    teams: { name: string }[];
    user: { username: string };
    restricted_view?: { is_open: boolean } | null;
};

type Chapter = {
    branches: ChapterBranch[];
    name: string | null;
    number: string;
    volume: string;
};

type ChaptersResponse = {
    data: Chapter[];
};

type PagesResponse = {
    data: {
        pages: { slug: number; url: string }[];
    };
};

type ImageServer = {
    id: string;
    url: string;
    site_ids: number[];
};

type ConstantsResponse = {
    data: { imageServers: ImageServer[] };
};

export abstract class LibGroup {
    protected abstract readonly siteId: number;
    protected abstract readonly baseUrl: string;
    protected abstract readonly apiUrl: string;

    protected readonly imgApiUrl: string = "https://api.cdnlibs.org";
    private imgUrl: string | null = null;

    getSettings(): Settings {
        return { supportsMultiScanlator: true };
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = new URL(`${this.apiUrl}/api/manga`);

        url.searchParams.set("page", "1");
        url.searchParams.append("site_id[]", String(this.siteId));

        if (opts.query) url.searchParams.set("q", opts.query);

        const json = await this.fetchJson<MangasPage>(url.toString());
        if (!json) return [];

        return json.data.map((manga) => ({
            id: manga.slug_url,
            title: manga.rus_name || manga.name,
            synonyms: manga.rus_name && manga.name !== manga.rus_name ? [manga.name] : undefined,
            image: manga.cover.default ?? undefined,
        }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const json = await this.fetchJson<ChaptersResponse>(`${this.apiUrl}/api/manga/${id}/chapters`);
        if (!json || json.data.length === 0) return [];

        const chapters = json.data
            .flatMap((chapter) => (chapter.branches.length > 0 ? chapter.branches : [null]).map((branch) => this.toChapterDetails(id, chapter, branch)))
            .filter((chapter): chapter is Omit<ChapterDetails, "index"> => chapter !== null)
            .sort((a, b) => this.chapterOrderValue(a.chapter) - this.chapterOrderValue(b.chapter));

        return chapters.map((chapter, index) => ({ ...chapter, index }));
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const json = await this.fetchJson<PagesResponse>(`${this.apiUrl}/api/manga/${id}`);
        if (!json) return [];

        const server = await this.getImgUrl();

        return json.data.pages
            .sort((a, b) => a.slug - b.slug)
            .map((page, index) => ({
                url: `${server}${page.url}`,
                index,
                headers: { Referer: this.baseUrl },
            }));
    }

    private chapterOrderValue(chapter: string): number {
        const value = parseFloat(chapter);
        return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
    }

    private toChapterDetails(slug: string, chapter: Chapter, branch: ChapterBranch | null): Omit<ChapterDetails, "index"> | null {
        if (branch?.restricted_view && !branch.restricted_view.is_open) return null;

        const branchParam = branch?.branch_id != null ? `&branch_id=${branch.branch_id}` : "";
        const id = `${slug}/chapter?volume=${chapter.volume}&number=${chapter.number}${branchParam}`;
        const baseName = `Том ${chapter.volume}. Глава ${chapter.number}`;
        const title = chapter.name ? `${baseName} - ${chapter.name}` : baseName;

        return {
            id,
            url: `${this.baseUrl}/ru/${slug}/read/v${chapter.volume}/c${chapter.number}`,
            title,
            chapter: chapter.number,
            scanlator: branch?.teams[0]?.name ?? branch?.user.username,
            updatedAt: branch?.created_at,
        };
    }

    private async getImgUrl(): Promise<string> {
        if (this.imgUrl) return this.imgUrl;

        const json = await this.fetchJson<ConstantsResponse>(`${this.imgApiUrl}/api/constants?fields[]=imageServers`);
        const servers = json?.data.imageServers.filter((server) => server.site_ids.includes(this.siteId)) ?? [];
        const server = servers.find((server) => server.id === "compress") ?? servers[0];

        if (server?.url) this.imgUrl = server.url;
        return this.imgUrl ?? "";
    }

    private async fetchJson<T>(url: string): Promise<T | null> {
        try {
            const res = await fetch(url, {
                headers: {
                    Accept: "application/json",
                    Referer: this.baseUrl,
                    "Site-Id": String(this.siteId),
                },
            });
            return res.ok ? ((await res.json()) as T) : null;
        } catch {
            return null;
        }
    }
}
