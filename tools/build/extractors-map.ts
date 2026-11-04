import { Domain } from "../lib/domains";
import { readRegistry } from "../lib/registry";
import { VirtualModule } from "./virtual-modules";

export function extractorsMapModule(domain: Domain, allowed: string[]): VirtualModule {
    const registry = readRegistry(domain);

    for (const id of allowed) {
        if (!registry[id]?.file || !registry[id]?.export) throw new Error(`Unknown extractor "${id}" in ${domain.registryPath}`);
    }

    const aliases = allowed.flatMap((id) => (registry[id]!.aliases ?? []).map((alias) => [alias, id] as const));

    for (const [alias] of aliases) {
        if (allowed.includes(alias) || aliases.filter(([other]) => other === alias).length > 1) {
            throw new Error(`Ambiguous extractor alias "${alias}" in ${domain.registryPath}`);
        }
    }

    const contents = [
        ...allowed.map((id) => `import { ${registry[id]!.export} } from "./${registry[id]!.file}";`),
        `export const EXTRACTORS = {`,
        ...allowed.map((id) => `    ${id}: ${registry[id]!.export},`),
        `};`,
        `export const EXTRACTOR_ALIASES = {`,
        ...aliases.map(([alias, id]) => `    ${JSON.stringify(alias)}: ${JSON.stringify(id)},`),
        `};`,
    ].join("\n");

    return { contents, resolveDir: domain.itemsDir };
}
