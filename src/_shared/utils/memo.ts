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
