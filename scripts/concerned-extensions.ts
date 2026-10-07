import { readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { DOMAINS, Domain, UTILS_ROOT, declaredIds, findExtensionDirs, readRegistry } from "./domains";
import { changedFiles as gitChangedFiles } from "./git";

const base = process.argv[2];
const changedFiles = base ? gitChangedFiles(base) : [];

function isSharedChange(file: string, domain: Domain): boolean {
    if (file.startsWith(`${UTILS_ROOT}/`)) return true;
    if (!file.startsWith(`${domain.sharedRoot}/`)) return false;

    return !file.startsWith(`${domain.itemsDir}/`) || basename(file) === "index.ts";
}

function concernedForDomain(domain: Domain): string[] {
    const dirs = findExtensionDirs(domain.root);

    if (changedFiles.some((file) => isSharedChange(file, domain))) return dirs;

    const registry = readRegistry(domain);
    const changedItems = Object.entries(registry)
        .filter(([id, entry]) => changedFiles.includes(`${domain.itemsDir}/${entry.file ?? id}.ts`))
        .map(([id]) => id);

    const directlyChangedDirs = changedFiles
        .filter((file) => ["payload.ts", "manifest.json"].includes(basename(file)))
        .map((file) => dirname(file))
        .filter((dir) => dirs.includes(dir));

    const dependentDirs =
        changedItems.length === 0
            ? []
            : dirs.filter((dir) => {
                  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
                  return declaredIds(manifest, domain.manifestField).some((id) => changedItems.includes(id));
              });

    return [...directlyChangedDirs, ...dependentDirs];
}

function concernedDirs(): string[] {
    const rebuildAll = changedFiles.length === 0 || changedFiles.some((file) => file === "bundle.ts" || file === "scripts/domains.ts");

    return rebuildAll ? DOMAINS.flatMap((domain) => findExtensionDirs(domain.root)) : DOMAINS.flatMap(concernedForDomain);
}

console.log(Array.from(new Set(concernedDirs())).sort().join("\n"));
