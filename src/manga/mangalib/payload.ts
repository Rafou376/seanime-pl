/// <reference path="../../_shared/manga/manga-provider.d.ts" />
import { LibGroup } from "../../_shared/manga/templates/libgroup";

export class Provider extends LibGroup {
    protected readonly siteId = 1;
    protected readonly baseUrl = "https://mangalib.org";
    protected readonly apiUrl = "https://api.cdnlibs.org";
}
