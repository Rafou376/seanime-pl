import { getText } from "./text";

export function getTextByClassPrefix(scope: DocSelection, prefix: string): string | null {
    const selector = `[class^="${prefix}"], [class*=" ${prefix}"]`;
    let result: string | null = null;

    scope.find(selector).each((_, element) => {
        if (result !== null || element.find(selector).length() > 0) return;

        result = getText(element) || null;
    });

    return result;
}
