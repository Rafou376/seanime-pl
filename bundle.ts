import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = "src/onlinestream";

function findExtensionDirs(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (!statSync(full).isDirectory()) return [];
        return existsSync(join(full, "payload.ts")) ? [full] : findExtensionDirs(full);
    });
}

async function buildExtension(dir: string) {
    const result = await esbuild.build({
        entryPoints: [join(dir, "payload.ts")],
        bundle: true,
        write: false,
        target: "es2020",
        platform: "neutral",
    });

    const referenceHeader = `/// <reference path="./_shared/onlinestream/online-streaming-provider.d.ts" />\n`;
    const bundledCode = referenceHeader + result.outputFiles[0].text;

    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    manifest.payload = bundledCode;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + "\n");

    console.log(`✓ built ${dir}`);
}

async function main() {
    const requested = process.argv.slice(2).filter(Boolean);
    const dirs = requested.length > 0 ? requested : findExtensionDirs(ROOT);

    if (dirs.length === 0) {
        console.log(`No extensions found (no payload.ts under ${ROOT}/).`);
        return;
    }

    await Promise.all(dirs.map(buildExtension));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});