import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { DOMAINS, declaredIds, findExtensionDirs } from "./domains";

const base = process.argv[2];

function showAt(ref: string, path: string): string | null {
    try {
        return execSync(`git show ${ref}:${path}`, { encoding: "utf-8" });
    } catch {
        return null;
    }
}

function bumpPatch(version: string): string {
    const parts = version.split(".");
    const patch = Number(parts[2] ?? 0) + 1;
    return [parts[0], parts[1], patch].join(".");
}

if (!base) {
    process.exit(0);
}

for (const domain of DOMAINS) {
    const oldRegistry = JSON.parse(showAt(base, domain.registryPath) ?? "{}");
    const newRegistry = JSON.parse(readFileSync(domain.registryPath, "utf-8"));

    const bumped = Object.keys(newRegistry).filter(
        (id) => oldRegistry[id]?.version !== undefined && oldRegistry[id].version !== newRegistry[id].version,
    );

    if (bumped.length === 0) continue;

    for (const dir of findExtensionDirs(domain.root)) {
        const manifestPath = join(dir, "manifest.json");
        const oldManifest = JSON.parse(showAt(base, manifestPath) ?? "null");
        const newManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        if (!oldManifest) continue;

        const declared = new Set([...(domain.alwaysConcerned ?? []), ...declaredIds(newManifest, domain.manifestField)]);
        const uses = bumped.some((id) => declared.has(id));
        if (!uses || oldManifest.version !== newManifest.version) continue;

        newManifest.version = bumpPatch(newManifest.version);
        writeFileSync(manifestPath, JSON.stringify(newManifest, null, 4) + "\n");
        console.log(`bumped ${newManifest.id} to ${newManifest.version}`);
    }
}
