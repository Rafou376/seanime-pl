import { existsSync, readdirSync } from "fs";
import { posix } from "path";

export type Domain = {
    root: string;
    sharedRoot: string;
    declaration: string;
    itemsDir: string;
    registryPath: string;
    manifestField: string;
};

export const CORE_ROOT = "src/_shared/core";

function defineDomain(options: { name: string; itemsFolder: string; declaration: string; manifestField: string }): Domain {
    const sharedRoot = `src/_shared/${options.name}`;

    return {
        root: `src/${options.name}`,
        sharedRoot,
        declaration: options.declaration,
        itemsDir: `${sharedRoot}/${options.itemsFolder}`,
        registryPath: `${sharedRoot}/registry.json`,
        manifestField: options.manifestField,
    };
}

export const DOMAINS: Domain[] = [
    defineDomain({
        name: "onlinestream",
        itemsFolder: "extractors",
        declaration: "./online-streaming-provider.d.ts",
        manifestField: "extractors",
    }),
    defineDomain({
        name: "manga",
        itemsFolder: "templates",
        declaration: "./manga-provider.d.ts",
        manifestField: "template",
    }),
];

export function findExtensionDirs(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (!entry.isDirectory()) return [];

        const full = posix.join(dir, entry.name);
        return existsSync(posix.join(full, "payload.ts")) ? [full] : findExtensionDirs(full);
    });
}

export function domainForDir(dir: string): Domain {
    const normalized = posix.normalize(dir.replace(/\\/g, "/"));
    const domain = DOMAINS.find((d) => normalized.startsWith(`${d.root}/`));
    if (!domain) throw new Error(`No domain configured for ${dir}`);
    return domain;
}
