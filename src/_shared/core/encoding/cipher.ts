const LETTER_RE = /[a-z]/gi;

export function rot13(input: string): string {
    return input.replace(LETTER_RE, (char) => {
        const base = char <= "Z" ? 65 : 97;
        return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
    });
}

export function shiftChars(input: string, shift: number): string {
    return Array.from(input, (char) => String.fromCharCode(char.charCodeAt(0) - shift)).join("");
}

export function reverse(input: string): string {
    return Array.from(input).reverse().join("");
}
