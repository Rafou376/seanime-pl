import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

export type Domain = {
    root: string;
    sharedRoot: string;
    declaration: string;
    itemsDir: string;
    registryPath: string;
    manifestField: string;
    alwaysConcerned?: string[];
};

export const DOMAINS: Domain[] = [
    {
        root: "src/onlinestream",
        sharedRoot: "src/_shared/onlinestream",
        declaration: "./_shared/onlinestream/online-streaming-provider.d.ts",
        itemsDir: "src/_shared/onlinestream/extractors",
        registryPath: "src/_shared/onlinestream/registry.json",
        manifestField: "extractors",
        alwaysConcerned: ["generic"],
    },
    {
        root: "src/manga",
        sharedRoot: "src/_shared/manga",
        declaration: "./_shared/manga/manga-provider.d.ts",
        itemsDir: "src/_shared/manga/templates",
        registryPath: "src/_shared/manga/registry.json",
        manifestField: "template",
    },
];

export function findExtensionDirs(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (!statSync(full).isDirectory()) return [];
        return existsSync(join(full, "payload.ts")) ? [full] : findExtensionDirs(full);
    });
}

export function domainForDir(dir: string): Domain {
    const domain = DOMAINS.find((d) => dir === d.root || dir.startsWith(`${d.root}/`));
    if (!domain) throw new Error(`No domain configured for ${dir}`);
    return domain;
}

export function declaredIds(manifest: any, field: string): string[] {
    const value = manifest[field];
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
}
