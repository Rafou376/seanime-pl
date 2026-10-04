import { execFileSync } from "child_process";

export function showAt(ref: string, path: string): string | null {
    try {
        return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
}

export function changedFiles(...refs: string[]): string[] {
    try {
        return execFileSync("git", ["diff", "--name-only", ...refs], { encoding: "utf-8" }).split("\n").filter(Boolean);
    } catch {
        return [];
    }
}
