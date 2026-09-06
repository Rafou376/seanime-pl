import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, basename } from "path";

const diffSpec = process.argv.slice(2).join(" ");

function findExtensionDirs(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (!statSync(full).isDirectory()) return [];
        return existsSync(join(full, "payload.ts")) ? [full] : findExtensionDirs(full);
    });
}

const allDirs = findExtensionDirs("src/onlinestream").sort();

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

if (changedFiles.length === 0) {
    printAndExit(allDirs);
    process.exit(0);
}

const extractorsDir = "src/_shared/onlinestream/extractors";
const changedExtractors = changedFiles
    .filter((f) => f.startsWith(`${extractorsDir}/`) && f.endsWith(".ts"))
    .map((f) => basename(f, ".ts"))
    .filter((id) => id !== "types" && id !== "index");

const otherSharedChanged = changedFiles.some(
    (f) => f.startsWith("src/_shared/") && !f.startsWith(`${extractorsDir}/`),
);

if (otherSharedChanged || changedFiles.includes("bundle.ts") || changedExtractors.includes("generic")) {
    printAndExit(allDirs);
    process.exit(0);
}

const directlyChangedDirs = changedFiles
    .map((f) => f.match(/^(src\/onlinestream\/.+)\/(?:payload\.ts|manifest\.json)$/)?.[1])
    .filter((dir): dir is string => Boolean(dir));

const dependentDirs = allDirs.filter((dir) => {
    if (changedExtractors.length === 0) return false;
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    const declared: string[] = manifest.extractors ?? [];
    return changedExtractors.some((id) => declared.includes(id));
});

printAndExit([...directlyChangedDirs, ...dependentDirs]);
