/// <reference path="../../_shared/manga/manga-provider.d.ts" />
import { Origines } from "../../_shared/manga/templates/origines";

export class Provider extends Origines {
    protected readonly baseUrl = "https://hentai-origines.com";
    protected readonly mangaPath = "manga";
}
