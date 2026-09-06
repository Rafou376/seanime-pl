import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = "src/onlinestream";
const EXTRACTORS_DIR = "src/_shared/onlinestream/extractors";
const REGISTRY_PATH = "src/_shared/onlinestream/registry.json";
const REGISTRY: Record<string, { file: string; export: string }> = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));

function findExtensionDirs(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (!statSync(full).isDirectory()) return [];
        return existsSync(join(full, "payload.ts")) ? [full] : findExtensionDirs(full);
    });
}

function virtualExtractorsMapPlugin(allowed: string[]): esbuild.Plugin {
    return {
        name: "virtual-extractors-map",
        setup(build) {
            build.onResolve({ filter: /^virtual:extractors-map$/ }, (args) => ({
                path: args.path,
                namespace: "virtual-extractors-map",
            }));
            build.onLoad({ filter: /.*/, namespace: "virtual-extractors-map" }, () => {
                const contents = [
                    ...allowed.map((id) => `import { ${REGISTRY[id].export} } from "./${REGISTRY[id].file}";`),
                    `export const EXTRACTORS = {`,
                    ...allowed.map((id) => `    ${id}: ${REGISTRY[id].export},`),
                    `};`,
                ].join("\n");

                return { contents, loader: "ts", resolveDir: EXTRACTORS_DIR };
            });
        },
    };
}

function stripPathComments(code: string): string {
    return code.replace(/^\/\/ .+\.tsx?\n/gm, "");
}

async function buildExtension(dir: string) {
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const allowed: string[] = manifest.extractors ?? [];

    const result = await esbuild.build({
        entryPoints: [join(dir, "payload.ts")],
        bundle: true,
        write: false,
        target: "es2020",
        platform: "neutral",
        plugins: [virtualExtractorsMapPlugin(allowed)],
    });

    const referenceHeader = `/// <reference path="./_shared/onlinestream/online-streaming-provider.d.ts" />\n`;
    const bundledCode = referenceHeader + stripPathComments(result.outputFiles[0].text);

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
