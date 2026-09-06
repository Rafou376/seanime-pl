import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

function findManifests(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (!statSync(full).isDirectory()) return [];
        const manifestPath = join(full, "manifest.json");
        return existsSync(manifestPath) ? [manifestPath] : findManifests(full);
    });
}

let failed = false;

for (const manifestPath of findManifests("src/onlinestream")) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const payload = manifest.payload ?? "";

    if (/^\s*(import|export)\s/m.test(payload)) {
        console.error(`::error::${manifestPath} contains a payload with import/export`);
        failed = true;
    }

    if (/^\/\/ .+\.tsx?$/m.test(payload)) {
        console.error(`::error::${manifestPath} contains a payload with file-path comments`);
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}
