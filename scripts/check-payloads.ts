import { readFileSync } from "fs";
import { join } from "path";
import { DOMAINS, findExtensionDirs } from "./domains";

let failed = false;

for (const dir of DOMAINS.flatMap((domain) => findExtensionDirs(domain.root))) {
    const manifestPath = join(dir, "manifest.json");
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
