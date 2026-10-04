/// <reference path="../../_shared/manga/manga-provider.d.ts" />
import { FMReader } from "../../_shared/manga/templates/fmreader";

const MANGA_SLUG_RE = /manga-(.+)/;
const RAW_SLUG_RE = /raw-(.+)/;

export class Provider extends FMReader {
    protected readonly baseUrl = "https://nihonkuni.com";
    protected override readonly cookies = { smartlink_shown: "1" };

    protected override readonly mangaListClass = "manga-grid";
    protected override readonly mangaCardClass = "manga-card";
    protected override readonly mangaTitleClass = "manga-title";
    protected override readonly mangaCoverClass = "manga-cover";

    protected override readonly chapterListClass = "at-series";
    protected override readonly chapterNameClass = "chapter-name";
    protected override readonly chapterTimeClass = "chapter-time";

    protected override readonly pageImagePattern = /\sid\s*=\s*["'][^"']*page\d+/i;
    protected override readonly pageImageAttrs = ["src"];

    protected override chapterListUrl(id: string): string {
        const slug = (MANGA_SLUG_RE.exec(id)?.[1] ?? RAW_SLUG_RE.exec(id)?.[1] ?? id).split(".html")[0];

        return `${this.baseUrl}/app/manga/controllers/cont.Listchapter.php?slug=${slug}`;
    }

    protected override chapterLinkBase(): string {
        return `${this.baseUrl}/`;
    }
}
