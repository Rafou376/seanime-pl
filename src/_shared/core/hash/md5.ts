const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const CONSTANTS = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
    0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
    0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
    0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function utf8Bytes(text: string): number[] {
    const bytes: number[] = [];
    const encoded = encodeURIComponent(text);

    for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] === "%") {
            bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            bytes.push(encoded.charCodeAt(i));
        }
    }

    return bytes;
}

function wordToHex(word: number): string {
    let out = "";

    for (let i = 0; i < 4; i++) {
        const byte = (word >>> (i * 8)) & 0xff;
        out += (byte < 16 ? "0" : "") + byte.toString(16);
    }

    return out;
}

export function md5(input: string): string {
    const bytes = utf8Bytes(input);
    const bitLength = bytes.length * 8;

    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);

    const low = bitLength >>> 0;
    const high = Math.floor(bitLength / 4294967296);
    for (let i = 0; i < 4; i++) bytes.push((low >>> (i * 8)) & 0xff);
    for (let i = 0; i < 4; i++) bytes.push((high >>> (i * 8)) & 0xff);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89 | 0;
    let c0 = 0x98badcfe | 0;
    let d0 = 0x10325476;

    for (let offset = 0; offset < bytes.length; offset += 64) {
        const words: number[] = [];
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4;
            words.push(bytes[j]! | (bytes[j + 1]! << 8) | (bytes[j + 2]! << 16) | (bytes[j + 3]! << 24));
        }

        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;

        for (let i = 0; i < 64; i++) {
            let f: number;
            let g: number;

            if (i < 16) {
                f = (b & c) | (~b & d);
                g = i;
            } else if (i < 32) {
                f = (d & b) | (~d & c);
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = (7 * i) % 16;
            }

            const mixed = (a + f + CONSTANTS[i]! + words[g]!) | 0;
            const shift = SHIFTS[(i >> 4) * 4 + (i % 4)]!;

            a = d;
            d = c;
            c = b;
            b = (b + ((mixed << shift) | (mixed >>> (32 - shift)))) | 0;
        }

        a0 = (a0 + a) | 0;
        b0 = (b0 + b) | 0;
        c0 = (c0 + c) | 0;
        d0 = (d0 + d) | 0;
    }

    return wordToHex(a0) + wordToHex(b0) + wordToHex(c0) + wordToHex(d0);
}
