const REGEXP_SPECIAL_RE = /[.*+?^${}()|[\]\\]/g;
const REGEX_CACHE = new Map<string, RegExp>();

export function escapeRegExp(value: string): string {
    return value.replace(REGEXP_SPECIAL_RE, "\\$&");
}

export function cachedRegex(source: string, flags: string): RegExp {
    const key = `${flags}/${source}`;
    let re = REGEX_CACHE.get(key);

    if (re) {
        re.lastIndex = 0;
    } else {
        re = new RegExp(source, flags);
        REGEX_CACHE.set(key, re);
    }

    return re;
}
