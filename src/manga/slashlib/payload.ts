/// <reference path="../../_shared/manga/manga-provider.d.ts" />
import { LibGroup } from "../../_shared/manga/templates/libgroup";

export class Provider extends LibGroup {
    protected readonly siteId = 2;
    protected readonly baseUrl = "https://v2.shlib.life";
    protected readonly apiUrl = "https://hapi.hentaicdn.org";
}
