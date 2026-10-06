import { readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { DOMAINS, Domain, declaredIds, findExtensionDirs } from "./domains";
import { changedFiles as gitChangedFiles } from "./git";

const diffRefs = process.argv.slice(2).filter(Boolean);
const changedFiles = diffRefs.length > 0 ? gitChangedFiles(...diffRefs) : [];

function printAndExit(dirs: string[]) {
    console.log(Array.from(new Set(dirs)).sort().join("\n"));
}

const allDirs = DOMAINS.flatMap((domain) => findExtensionDirs(domain.root)).sort();

if (changedFiles.length === 0 || changedFiles.some((file) => file === "bundle.ts" || file === "scripts/domains.ts")) {
    printAndExit(allDirs);
    process.exit(0);
}

function concernedForDomain(domain: Domain): string[] {
    const dirs = findExtensionDirs(domain.root);

    const changedItems = changedFiles
        .filter((f) => f.startsWith(`${domain.itemsDir}/`) && f.endsWith(".ts"))
        .map((f) => basename(f, ".ts"))
        .filter((id) => id !== "types" && id !== "index");

    const otherSharedChanged = changedFiles.some((f) => f.startsWith(`${domain.sharedRoot}/`) && !f.startsWith(`${domain.itemsDir}/`));
    
    if (otherSharedChanged) {
        return dirs;
    }

    const directlyChangedDirs = changedFiles
        .filter((f) => f.startsWith(`${domain.root}/`) && ["payload.ts", "manifest.json"].includes(basename(f)))
        .map((f) => dirname(f));

    const dependentDirs = dirs.filter((dir) => {
        if (changedItems.length === 0) return false;
        const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
        const declared = declaredIds(manifest, domain.manifestField);
        return changedItems.some((id) => declared.includes(id));
    });

    return [...directlyChangedDirs, ...dependentDirs];
}

printAndExit(DOMAINS.flatMap(concernedForDomain));
