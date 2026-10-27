export function memoizeAsync<A extends unknown[], T>(load: (...args: A) => Promise<T | null>): (...args: A) => Promise<T | null> {
    let pending: Promise<T | null> | null = null;

    return (...args) =>
        (pending ??= load(...args)
            .catch(() => null)
            .then((value) => {
                if (value === null) pending = null;
                return value;
            }));
}

type TtlEntry<T> = {
    expires: number;
    value: Promise<T | null>;
};

export function createTtlCache<T>(ttl: number): (key: string, load: () => Promise<T | null>) => Promise<T | null> {
    const entries = new Map<string, TtlEntry<T>>();

    return (key, load) => {
        const now = Date.now();
        const hit = entries.get(key);
        if (hit && hit.expires > now) return hit.value;

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
