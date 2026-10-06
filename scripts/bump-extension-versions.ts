import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DOMAINS, declaredIds, findExtensionDirs } from "./domains";
import { showAt } from "./git";

const base = process.argv[2];

function bumpPatch(version: string): string {
    const [major, minor, patch] = version.split(".");
    return [major, minor, Number(patch ?? 0) + 1].join(".");
}

if (!base) {
    process.exit(0);
}

for (const domain of DOMAINS) {
    const oldRegistry = JSON.parse(showAt(base, domain.registryPath) ?? "{}");
    const newRegistry = JSON.parse(readFileSync(domain.registryPath, "utf-8"));

    const bumped = Object.keys(newRegistry).filter((id) => {
        const oldVersion = oldRegistry[id]?.version;
        const newVersion = newRegistry[id]?.version;

        return (
            Number.isInteger(oldVersion) &&
            Number.isInteger(newVersion) &&
            oldVersion > 0 &&
            newVersion > oldVersion
        );
    });

    if (bumped.length === 0) continue;

    for (const dir of findExtensionDirs(domain.root)) {
        const manifestPath = join(dir, "manifest.json");
        const oldManifest = JSON.parse(showAt(base, manifestPath) ?? "null");
        const newManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        if (!oldManifest) continue;

        const declared = new Set(declaredIds(newManifest, domain.manifestField));
        const uses = bumped.some((id) => declared.has(id));
        if (!uses || oldManifest.version !== newManifest.version) continue;

        newManifest.version = bumpPatch(newManifest.version);
        writeFileSync(manifestPath, JSON.stringify(newManifest, null, 4) + "\n");
        console.log(`bumped ${newManifest.id} to ${newManifest.version}`);
    }
}
