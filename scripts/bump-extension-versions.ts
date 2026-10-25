import { DOMAINS, Registry, declaredIds, findExtensionDirs, manifestFile, readManifest, readRegistry, writeManifest } from "./domains";
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

    for (const dir of findExtensionDirs(domain.root)) {
        const oldManifest = JSON.parse(showAt(base, manifestFile(dir)) ?? "null");
        const newManifest = readManifest(dir);
        if (!oldManifest) continue;

        const declared = new Set(declaredIds(newManifest, domain.manifestField));
        const usesBumped = bumped.some((id) => declared.has(id));
        const websiteChanged = oldManifest.website !== undefined && oldManifest.website !== newManifest.website;
        if (!(usesBumped || websiteChanged) || oldManifest.version !== newManifest.version) continue;

        newManifest.version = bumpPatch(String(newManifest.version));
        writeManifest(dir, newManifest);
        console.log(`bumped ${newManifest.id} to ${newManifest.version}`);
    }
}
