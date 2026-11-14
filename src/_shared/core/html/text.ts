const WHITESPACE_RE = /\s+/g;
const LT_RE = /</g;
const LEADING_SPACE_RE = /^\s+/;
const TRAILING_SPACE_RE = /\s+$/;

export function decodeEntities(text: string): string {
    return LoadDoc(`<div>${text.replace(LT_RE, "&lt;")}</div>`)("div").text();
}

export function normalizeText(text: string): string {
    return text.replace(WHITESPACE_RE, " ").trim();
}

export function getText(selection: DocSelection): string {
    return normalizeText(selection.text());
}

export function isLetter(char: string): boolean {
    return char.toLowerCase() !== char.toUpperCase();
}

export function isLowercase(char: string): boolean {
    return isLetter(char) && char === char.toLowerCase();
}

export function joinPieces(left: string, right: string, markOnLeft: boolean): string {
    const head = left.replace(TRAILING_SPACE_RE, "");
    const tail = right.replace(LEADING_SPACE_RE, "");
    const splitsWord = isLetter(head.slice(-1)) && isLowercase(tail.charAt(0));
    const spaceOnTextSide = markOnLeft ? head === left && tail !== right : head !== left && tail === right;

    return splitsWord && spaceOnTextSide ? head + tail : left + right;
}
