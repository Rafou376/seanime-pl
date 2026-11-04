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

export function postProcess(code: string): string {
    return stripPureAnnotations(stripExports(stripPathComments(code)));
}
