import { readFileSync, writeFileSync } from "fs";
import { posix } from "path";
import { DOMAINS, Registry, declaredIds, findExtensionDirs, readRegistry } from "./domains";
import { showAt } from "./git";

const base = process.argv[2];

if (!base) {
    process.exit(0);
}

function bumpPatch(version: string): string {
    const [major, minor, patch] = version.split(".");
    return [major, minor, Number(patch ?? 0) + 1].join(".");
}

for (const domain of DOMAINS) {
    const oldRegistry: Registry = JSON.parse(showAt(base, domain.registryPath) ?? "{}");
    const newRegistry = readRegistry(domain);

    const bumped = Object.keys(newRegistry).filter((id) => {
        const oldVersion = oldRegistry[id]?.version;
        const newVersion = newRegistry[id]?.version;

        return (
            oldVersion !== undefined &&
            newVersion !== undefined &&
            Number.isInteger(oldVersion) &&
            Number.isInteger(newVersion) &&
            oldVersion > 0 &&
            newVersion > oldVersion
        );
    });

    if (bumped.length === 0) continue;

    for (const dir of findExtensionDirs(domain.root)) {
        const manifestPath = posix.join(dir, "manifest.json");
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
