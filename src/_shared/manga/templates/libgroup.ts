import { fetchJson } from "../../utils/http";
import { memoizeAsync } from "../../utils/memo";
import { sortChapters } from "../provider-helpers";

type MangaShort = {
    name: string;
    rus_name?: string | null;
    slug_url: string;
    cover: { default?: string | null };
};

type MangasPage = {
    data?: MangaShort[];
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
    data?: Chapter[];
};

type PagesResponse = {
    data?: {
        pages?: { slug: number; url: string }[];
    };
};

type ImageServer = {
    id: string;
    url: string;
    site_ids: number[];
};

type ConstantsResponse = {
    data?: { imageServers?: ImageServer[] };
};

export abstract class LibGroup {
    protected abstract readonly siteId: number;
    protected abstract readonly baseUrl: string;
    protected abstract readonly apiUrl: string;

    protected readonly imgApiUrl: string = "https://api.cdnlibs.org";
    private readonly getImgUrl = memoizeAsync(() => this.loadImgUrl());

    getSettings(): Settings {
        return { supportsMultiScanlator: true };
    }

    async search(opts: QueryOptions): Promise<SearchResult[]> {
        const url = new URL(`${this.apiUrl}/api/manga`);

        url.searchParams.set("page", "1");
        url.searchParams.append("site_id[]", String(this.siteId));

        if (opts.query) url.searchParams.set("q", opts.query);

        const json = await this.fetchApi<MangasPage>(url.toString());

        return (json?.data ?? []).map((manga) => ({
            id: manga.slug_url,
            title: manga.rus_name || manga.name,
            synonyms: manga.rus_name && manga.name !== manga.rus_name ? [manga.name] : undefined,
            image: manga.cover.default ?? undefined,
        }));
    }

    async findChapters(id: string): Promise<ChapterDetails[]> {
        const json = await this.fetchApi<ChaptersResponse>(`${this.apiUrl}/api/manga/${id}/chapters`);
        const data = json?.data;
        if (!data?.length) return [];

        const chapters = data.flatMap((chapter) =>
            (chapter.branches.length > 0 ? chapter.branches : [null]).flatMap((branch) => {
                const details = this.toChapterDetails(id, chapter, branch);

                return details ? [details] : [];
            }),
        );

        return sortChapters(chapters);
    }

    async findChapterPages(id: string): Promise<ChapterPage[]> {
        const [json, server] = await Promise.all([this.fetchApi<PagesResponse>(`${this.apiUrl}/api/manga/${id}`), this.getImgUrl()]);
        const pages = json?.data?.pages;
        if (!pages || !server) return [];

        return [...pages]
            .sort((a, b) => a.slug - b.slug)
            .map((page, index) => ({
                url: `${server}${page.url}`,
                index,
                headers: { Referer: this.baseUrl },
            }));
    }

    private toChapterDetails(slug: string, chapter: Chapter, branch: ChapterBranch | null): Omit<ChapterDetails, "index"> | null {
        if (branch?.restricted_view && !branch.restricted_view.is_open) return null;

        const params = new URLSearchParams({ volume: chapter.volume, number: chapter.number });
        if (branch?.branch_id != null) params.set("branch_id", String(branch.branch_id));

        const id = `${slug}/chapter?${params.toString()}`;
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

    private async loadImgUrl(): Promise<string | null> {
        const json = await this.fetchApi<ConstantsResponse>(`${this.imgApiUrl}/api/constants?fields[]=imageServers`);
        const servers = json?.data?.imageServers?.filter((server) => server.site_ids.includes(this.siteId)) ?? [];
        const server = servers.find((candidate) => candidate.id === "compress") ?? servers[0];

        return server?.url || null;
    }

    private fetchApi<T>(url: string): Promise<T | null> {
        return fetchJson<T>(url, {
            headers: {
                Accept: "application/json",
                Referer: this.baseUrl,
                "Site-Id": String(this.siteId),
            },
        });
    }
}
