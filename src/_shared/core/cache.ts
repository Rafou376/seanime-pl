export function memoizeAsync<A extends unknown[], T>(
    load: (...args: A) => Promise<T | null>,
    keyOf: (...args: A) => string = (...args) => JSON.stringify(args),
): (...args: A) => Promise<T | null> {
    const pending = new Map<string, Promise<T | null>>();

    return (...args) => {
        const key = keyOf(...args);
        let hit = pending.get(key);

        if (!hit) {
            hit = load(...args)
                .catch(() => null)
                .then((value) => {
                    if (value === null) pending.delete(key);
                    return value;
                });
            pending.set(key, hit);
        }

        return hit;
    };
}

type TtlEntry<T> = {
    expires: number;
    value: Promise<T | null>;
};

export function createTtlCache<T>(ttl: number): (key: string, load: () => Promise<T | null>) => Promise<T | null> {
    const entries = new Map<string, TtlEntry<T>>();

    return (key, load) => {
        const now = Date.now();

        for (const [cachedKey, cached] of entries) {
            if (cached.expires > now) break;
            entries.delete(cachedKey);
        }

        const hit = entries.get(key);
        if (hit) return hit.value;

        const entry: TtlEntry<T> = {
            expires: now + ttl,
            value: load()
                .catch(() => null)
                .then((value) => {
                    if (value === null && entries.get(key) === entry) entries.delete(key);
                    return value;
                }),
        };

        entries.set(key, entry);
        return entry.value;
    };
}
