import { readFileSync } from "fs";
import { Domain } from "./domains";

export type Registry = Record<string, { version?: number; file?: string; export?: string; aliases?: string[] }>;

export function readRegistry(domain: Domain): Registry {
    return JSON.parse(readFileSync(domain.registryPath, "utf-8"));
}
