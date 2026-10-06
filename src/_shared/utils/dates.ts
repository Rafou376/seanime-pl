export function utcIso(year: number, monthIndex: number, day: number): string | undefined {
    const date = new Date(Date.UTC(year, monthIndex, day));
    const valid = date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex && date.getUTCDate() === day;

    return valid ? date.toISOString() : undefined;
}
