import { readdirSync, statSync, existsSync } from "fs";
import { posix } from "path";

export type Domain = {
    root: string;
    sharedRoot: string;
    declaration: string;
    itemsDir: string;
    registryPath: string;
    manifestField: string;
};

export const DOMAINS: Domain[] = [
    {
        root: "src/onlinestream",
        sharedRoot: "src/_shared/onlinestream",
        declaration: "./online-streaming-provider.d.ts",
        itemsDir: "src/_shared/onlinestream/extractors",
        registryPath: "src/_shared/onlinestream/registry.json",
        manifestField: "extractors",
    },
    {
        root: "src/manga",
        sharedRoot: "src/_shared/manga",
        declaration: "./manga-provider.d.ts",
        itemsDir: "src/_shared/manga/templates",
        registryPath: "src/_shared/manga/registry.json",
        manifestField: "template",
    },
];

export function findExtensionDirs(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = posix.join(dir, entry);
        if (!statSync(full).isDirectory()) return [];
        return existsSync(posix.join(full, "payload.ts")) ? [full] : findExtensionDirs(full);
    });
}

export function domainForDir(dir: string): Domain {
    const normalized = posix.normalize(dir.replace(/\\/g, "/"));
    const domain = DOMAINS.find((d) => normalized === d.root || normalized.startsWith(`${d.root}/`));
    if (!domain) throw new Error(`No domain configured for ${dir}`);
    return domain;
}

export function declaredIds(manifest: Record<string, unknown>, field: string): string[] {
    const value = manifest[field];
    if (Array.isArray(value)) return value.map(String);
    return value ? [String(value)] : [];
}
