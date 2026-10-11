import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DOMAINS, Domain, domainForDir, findExtensionDirs, readRegistry } from "./scripts/domains";

type VirtualModule = { contents: string; resolveDir?: string };

function virtualModulesPlugin(modules: Record<string, VirtualModule>): esbuild.Plugin {
    return {
        name: "virtual-modules",
        setup(build) {
            build.onResolve({ filter: /^virtual:/ }, (args) =>
                args.path in modules ? { path: args.path, namespace: "virtual" } : undefined,
            );
            build.onLoad({ filter: /.*/, namespace: "virtual" }, (args) => ({
                contents: modules[args.path]!.contents,
                loader: "ts",
                resolveDir: modules[args.path]!.resolveDir,
            }));
        },
    };
}

function extractorsMapModule(domain: Domain, allowed: string[]): VirtualModule {
    const registry = readRegistry(domain);

    for (const id of allowed) {
        if (!registry[id]?.file || !registry[id]?.export) throw new Error(`Unknown extractor "${id}" in ${domain.registryPath}`);
    }

    const contents = [
        ...allowed.map((id) => `import { ${registry[id]!.export} } from "./${registry[id]!.file}";`),
        `export const EXTRACTORS = {`,
        ...allowed.map((id) => `    ${id}: ${registry[id]!.export},`),
        `};`,
    ].join("\n");

    return { contents, resolveDir: domain.itemsDir };
}

function stripPathComments(code: string): string {
    return code.replace(/^\/\/ (?:.+\.tsx?|virtual:.+)\n/gm, "");
}

function stripPureAnnotations(code: string): string {
    return code.replace(/\/\* @__PURE__ \*\/ ?/g, "");
}

function stripExports(code: string): string {
    return code
        .replace(/export\s*\{[^}]*\}\s*;?\s*/g, "")
        .replace(/^export (?=(class|function|const|let|var)\s)/gm, "");
}

async function buildExtension(dir: string) {
    const domain = domainForDir(dir);
    const manifestPath = join(dir, "manifest.json");
    const raw = readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(raw);

    const modules: Record<string, VirtualModule> = {
        "virtual:website": { contents: `export const WEBSITE = ${JSON.stringify(manifest.website)};` },
    };
    if (manifest.extractors) modules["virtual:extractors-map"] = extractorsMapModule(domain, manifest.extractors);

    const result = await esbuild.build({
        entryPoints: [join(dir, "payload.ts")],
        bundle: true,
        write: false,
        target: "es2020",
        platform: "neutral",
        charset: "utf8",
        plugins: [virtualModulesPlugin(modules)],
    });

    const referenceHeader = `/// <reference path="${domain.declaration}" />\n\n`;
    const bundledCode = referenceHeader + stripPureAnnotations(stripExports(stripPathComments(result.outputFiles[0]!.text)));

    manifest.payload = bundledCode;

    const output = JSON.stringify(manifest, null, 4) + "\n";
    if (output !== raw) writeFileSync(manifestPath, output);

    console.log(`✓ built ${dir}`);
}

async function main() {
    const requested = process.argv.slice(2).filter(Boolean);
    const dirs = requested.length > 0 ? requested : DOMAINS.flatMap((domain) => findExtensionDirs(domain.root));

    if (dirs.length === 0) {
        console.log(`No extensions found (no payload.ts under ${DOMAINS.map((d) => d.root).join(", ")}).`);
        return;
    }

    const results = await Promise.allSettled(dirs.map(buildExtension));
    const failures = results.flatMap((result, index) => (result.status === "rejected" ? [{ dir: dirs[index], reason: result.reason }] : []));

    for (const { dir, reason } of failures) console.error(`✗ failed ${dir}`, reason);
    if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
