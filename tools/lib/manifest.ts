import { readFileSync, writeFileSync } from "fs";
import { posix } from "path";

export type Manifest = Record<string, unknown>;

export function manifestFile(dir: string): string {
    return posix.join(dir, "manifest.json");
}

export function readManifest(dir: string): Manifest {
    return JSON.parse(readFileSync(manifestFile(dir), "utf-8"));
}

export function writeManifest(dir: string, manifest: Manifest): void {
    writeFileSync(manifestFile(dir), JSON.stringify(manifest, null, 4) + "\n");
}

export function declaredIds(manifest: Manifest, field: string): string[] {
    const value = manifest[field];
    if (Array.isArray(value)) return value.map(String);
    return value ? [String(value)] : [];
}

export function isValidWebsite(value: unknown): value is string {
    return typeof value === "string" && /^https?:\/\/[^\s/]+$/.test(value);
}
