export function utcIso(year: number, monthIndex: number, day: number): string | undefined {
    const date = new Date(Date.UTC(year, monthIndex, day));

    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
