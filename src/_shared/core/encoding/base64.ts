const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToBinaryString(input: string): string {
    let output = "";
    let buffer = 0;
    let bits = 0;

    for (const char of input) {
        const value = ALPHABET.indexOf(char);
        if (value < 0) continue;

        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits < 8) continue;

        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
        buffer &= (1 << bits) - 1;
    }

    return output;
}

export function binaryStringToBase64(input: string): string {
    let output = "";

    for (let i = 0; i < input.length; i += 3) {
        const chunk = (input.charCodeAt(i) << 16) | ((input.charCodeAt(i + 1) || 0) << 8) | (input.charCodeAt(i + 2) || 0);
        const remaining = input.length - i;

        output += ALPHABET[(chunk >> 18) & 63]! + ALPHABET[(chunk >> 12) & 63]!;
        output += remaining > 1 ? ALPHABET[(chunk >> 6) & 63]! : "=";
        output += remaining > 2 ? ALPHABET[chunk & 63]! : "=";
    }

    return output;
}
