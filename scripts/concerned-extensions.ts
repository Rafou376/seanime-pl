import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join, basename } from "path";
import { DOMAINS, Domain, declaredIds, findExtensionDirs } from "./domains";

const diffSpec = process.argv.slice(2).join(" ");

let changedFiles: string[] = [];
if (diffSpec) {
    try {
        changedFiles = execSync(`git diff --name-only ${diffSpec}`, { encoding: "utf-8" }).split("\n").filter(Boolean);
    } catch {
        changedFiles = [];
    }
}

function printAndExit(dirs: string[]) {
    console.log(Array.from(new Set(dirs)).sort().join("\n"));
}

const allDirs = DOMAINS.flatMap((domain) => findExtensionDirs(domain.root)).sort();

if (changedFiles.length === 0 || changedFiles.includes("bundle.ts")) {
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
    const hasAlwaysConcernedChange = domain.alwaysConcerned?.some((id) => changedItems.includes(id)) ?? false;

    if (otherSharedChanged || hasAlwaysConcernedChange) {
        return dirs;
    }

    const directlyChangedDirs = changedFiles
        .map((f) => f.match(new RegExp(`^(${domain.root}/.+)/(?:payload\\.ts|manifest\\.json)$`))?.[1])
        .filter((dir): dir is string => Boolean(dir));

    const dependentDirs = dirs.filter((dir) => {
        if (changedItems.length === 0) return false;
        const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
        const declared = declaredIds(manifest, domain.manifestField);
        return changedItems.some((id) => declared.includes(id));
    });

    return [...directlyChangedDirs, ...dependentDirs];
}

printAndExit(DOMAINS.flatMap(concernedForDomain));
