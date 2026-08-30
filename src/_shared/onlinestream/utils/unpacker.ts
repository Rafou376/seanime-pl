
// Decodes a script obfuscated with the "Dean Edwards Packer"
export function unpack(p: string, a: number, c: number, k: string[]): string {
    while (c--) {
        if (k[c]) p = p.replace(new RegExp(`\\b${c.toString(a)}\\b`, "g"), k[c]);
    }
    return p;
}