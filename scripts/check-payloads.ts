import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { Script } from "vm";
import { DOMAINS, findExtensionDirs } from "./domains";

let failed = false;

function fail(file: string, message: string) {
    console.error(`::error file=${file}::${file} ${message}`);
    failed = true;
}

function text(value: unknown): string {
    return typeof value === "string" ? value : "";
}

for (const domain of DOMAINS) {
    for (const dir of findExtensionDirs(domain.root)) {
        const manifestPath = join(dir, "manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<string, unknown>;
        const payload = text(manifest.payload);

        if (payload.trim() === "") {
            fail(manifestPath, "contains an empty payload");
            continue;
        }

        if (/^\s*(import|export)\s/m.test(payload)) {
            fail(manifestPath, "contains a payload with import/export");
        }

        try {
            new Script(payload, { filename: manifestPath });
        } catch (error) {
            fail(manifestPath, `contains a payload with invalid syntax: ${error instanceof Error ? error.message : error}`);
        }

        if (/^\/\/ .+\.tsx?$/m.test(payload)) {
            fail(manifestPath, "contains a payload with file-path comments");
        }
        if (!payload.startsWith(`/// <reference path="${domain.declaration}" />\n`)) {
            fail(manifestPath, "contains a payload without the expected reference header");
        }
        if (!/^(?:class\s+Provider\b|(?:var|let|const)\s+Provider\s*=\s*class\b)/m.test(payload)) {
            fail(manifestPath, "contains a payload without a top-level class Provider");
        }

        const folder = basename(dir);
        if (manifest.id !== folder) {
            fail(manifestPath, `has id "${text(manifest.id)}" which differs from its folder name "${folder}"`);
        }
        if (!/^\d+\.\d+\.\d+$/.test(text(manifest.version))) {
            fail(manifestPath, `has version "${text(manifest.version)}" which is not a valid MAJOR.MINOR.PATCH version`);
        }

        const manifestSuffix = `/${dir}/manifest.json`;
        const manifestUri = text(manifest.manifestURI);

        if (!/^https:\/\//.test(manifestUri) || !manifestUri.endsWith(manifestSuffix)) {
            fail(manifestPath, `has manifestURI "${manifestUri}" which does not end with "${manifestSuffix}"`);
            continue;
        }

        const iconPrefix = `${manifestUri.slice(0, -manifestSuffix.length)}/${dir}/`;
        const icon = text(manifest.icon);

        if (icon !== `${iconPrefix}icon.ico`) {
            fail(manifestPath, `has icon "${icon}" instead of "${iconPrefix}icon.ico"`);
        } else if (!existsSync(join(dir, "icon.ico"))) {
            fail(manifestPath, `references icon file "icon.ico" which does not exist in ${dir}`);
        }
    }
}

if (failed) {
    process.exit(1);
}
