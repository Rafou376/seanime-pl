/// <reference path="../../_shared/manga/manga-provider.d.ts" />
import { FMReader } from "../../_shared/manga/templates/fmreader";

const MANGA_SLUG_RE = /manga-(.+)/;
const RAW_SLUG_RE = /raw-(.+)/;

export class Provider extends FMReader {
    protected readonly baseUrl = "https://nihonkuni.com";
    protected readonly cookies = { smartlink_shown: "1" };

    protected readonly mangaListClass = "manga-grid";
    protected readonly mangaCardClass = "manga-card";
    protected readonly mangaTitleClass = "manga-title";
    protected readonly mangaCoverClass = "manga-cover";

    protected readonly chapterListClass = "at-series";
    protected readonly chapterNameClass = "chapter-name";
    protected readonly chapterTimeClass = "chapter-time";

    protected readonly pageImagePattern = /\sid\s*=\s*["'][^"']*page\d+/i;
    protected readonly pageImageAttrs = ["src"];

    protected chapterListUrl(id: string): string {
        const slug = (MANGA_SLUG_RE.exec(id)?.[1] ?? RAW_SLUG_RE.exec(id)?.[1] ?? id).split(".html")[0];

        return `${this.baseUrl}/app/manga/controllers/cont.Listchapter.php?slug=${slug}`;
    }

    protected chapterLinkBase(): string {
        return `${this.baseUrl}/`;
    }
}
