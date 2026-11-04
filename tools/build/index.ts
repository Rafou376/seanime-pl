import * as esbuild from "esbuild";
import { join } from "path";
import { DOMAINS, domainForDir, findExtensionDirs } from "../lib/domains";
import { declaredIds, readManifest, writeManifest } from "../lib/manifest";
import { extractorsMapModule } from "./extractors-map";
import { postProcess } from "./post-process";
import { VirtualModule, virtualModulesPlugin } from "./virtual-modules";

async function buildExtension(dir: string) {
    const domain = domainForDir(dir);
    const manifest = readManifest(dir);

    const modules: Record<string, VirtualModule> = {
        "virtual:website": { contents: `export const WEBSITE = ${JSON.stringify(manifest.website)};` },
    };
    const extractors = declaredIds(manifest, "extractors");
    if (extractors.length > 0) modules["virtual:extractors-map"] = extractorsMapModule(domain, extractors);

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
    const bundledCode = referenceHeader + postProcess(result.outputFiles[0]!.text);

    manifest.payload = bundledCode;

    writeManifest(dir, manifest);

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
