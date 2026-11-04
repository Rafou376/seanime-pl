import { posix } from "path";
import { CORE_ROOT, DOMAINS, Domain, findExtensionDirs } from "../lib/domains";
import { changedFiles as gitChangedFiles, showAt } from "../lib/git";
import { declaredIds, manifestFile, readManifest } from "../lib/manifest";
import { readRegistry } from "../lib/registry";

const REBUILD_ALL_FILES = ["tsconfig.json", "config/tsconfig.base.json", "package.json", "package-lock.json"];
const REBUILD_ALL_PREFIXES = ["tools/build/", "tools/lib/"];

const base = process.argv[2];
const changedFiles = base ? gitChangedFiles(base) : [];

function isSharedChange(file: string, domain: Domain): boolean {
    if (file.startsWith(`${CORE_ROOT}/`)) return true;
    if (!file.startsWith(`${domain.sharedRoot}/`)) return false;

    return !file.startsWith(`${domain.itemsDir}/`) || posix.basename(file) === "index.ts";
}

function websiteChanged(dir: string): boolean {
    const oldWebsite = JSON.parse(showAt(base!, manifestFile(dir)) ?? "{}").website;
    const newWebsite = readManifest(dir).website;
    return oldWebsite !== newWebsite;
}

function concernedForDomain(domain: Domain): string[] {
    const dirs = findExtensionDirs(domain.root);

    if (changedFiles.some((file) => isSharedChange(file, domain))) return dirs;

    const registry = readRegistry(domain);
    const changedItems = Object.entries(registry)
        .filter(([id, entry]) => changedFiles.includes(`${domain.itemsDir}/${entry.file ?? id}.ts`))
        .map(([id]) => id);

    const directlyChangedDirs = changedFiles
        .filter((file) => dirs.includes(posix.dirname(file)))
        .filter((file) => ["payload.ts", "manifest.json"].includes(posix.basename(file)))
        .filter((file) => posix.basename(file) === "payload.ts" || websiteChanged(posix.dirname(file)))
        .map((file) => posix.dirname(file));

    const dependentDirs =
        changedItems.length === 0
            ? []
            : dirs.filter((dir) => declaredIds(readManifest(dir), domain.manifestField).some((id) => changedItems.includes(id)));

    return [...directlyChangedDirs, ...dependentDirs];
}

function concernedDirs(): string[] {
    const rebuildAll = changedFiles.length === 0 || changedFiles.some((file) => REBUILD_ALL_FILES.includes(file) || REBUILD_ALL_PREFIXES.some((prefix) => file.startsWith(prefix)));

    return rebuildAll ? DOMAINS.flatMap((domain) => findExtensionDirs(domain.root)) : DOMAINS.flatMap(concernedForDomain);
}

console.log(Array.from(new Set(concernedDirs())).sort().join("\n"));
