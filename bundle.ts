import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DOMAINS, findExtensionDirs, domainForDir } from "./scripts/domains";

function virtualExtractorsMapPlugin(registryPath: string, extractorsDir: string, allowed: string[]): esbuild.Plugin {
    const registry: Record<string, { file: string; export: string }> = JSON.parse(readFileSync(registryPath, "utf-8"));

    return {
        name: "virtual-extractors-map",
        setup(build) {
            build.onResolve({ filter: /^virtual:extractors-map$/ }, (args) => ({
                path: args.path,
                namespace: "virtual-extractors-map",
            }));
            build.onLoad({ filter: /.*/, namespace: "virtual-extractors-map" }, () => {
                const contents = [
                    ...allowed.map((id) => `import { ${registry[id].export} } from "./${registry[id].file}";`),
                    `export const EXTRACTORS = {`,
                    ...allowed.map((id) => `    ${id}: ${registry[id].export},`),
                    `};`,
                ].join("\n");

                return { contents, loader: "ts", resolveDir: extractorsDir };
            });
        },
    };
}

function stripPathComments(code: string): string {
    return code.replace(/^\/\/ .+\.tsx?\n/gm, "");
}

function stripExports(code: string): string {
    return code
        .replace(/export\s*\{[^}]*\}\s*;?\s*/g, "")
        .replace(/^export (?=(class|function|const|let|var)\s)/gm, "");
}

async function buildExtension(dir: string) {
    const domain = domainForDir(dir);
    const manifestPath = join(dir, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const allowed: string[] = manifest.extractors ?? [];

    const plugins = manifest.extractors ? [virtualExtractorsMapPlugin(domain.registryPath, domain.itemsDir, allowed)] : [];

    const result = await esbuild.build({
        entryPoints: [join(dir, "payload.ts")],
        bundle: true,
        write: false,
        target: "es2020",
        platform: "neutral",
        treeShaking: true,
        plugins,
    });

    const referenceHeader = `/// <reference path="${domain.declaration}" />\n`;
    const bundledCode = referenceHeader + stripExports(stripPathComments(result.outputFiles[0].text));

    manifest.payload = bundledCode;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 4) + "\n");

    console.log(`✓ built ${dir}`);
}

async function main() {
    const requested = process.argv.slice(2).filter(Boolean);
    const dirs = requested.length > 0 ? requested : DOMAINS.flatMap((domain) => findExtensionDirs(domain.root));

    if (dirs.length === 0) {
        console.log(`No extensions found (no payload.ts under ${DOMAINS.map((d) => d.root).join(", ")}).`);
        return;
    }

    await Promise.all(dirs.map(buildExtension));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
