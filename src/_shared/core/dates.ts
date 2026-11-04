type RelativeUnit = {
    words: string[];
    subtract: (date: Date, value: number) => void;
};

export function utcIso(year: number, monthIndex: number, day: number): string | undefined {
    const date = new Date(Date.UTC(year, monthIndex, day));
    const valid = date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex && date.getUTCDate() === day;

    return valid ? date.toISOString() : undefined;
}

function subtractMonths(date: Date, months: number): void {
    const day = date.getUTCDate();

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - months);
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
}

const RELATIVE_UNITS: RelativeUnit[] = [
    { words: ["sec", "giây", "segundo", "saniye"], subtract: (date, value) => date.setUTCSeconds(date.getUTCSeconds() - value) },
    { words: ["min", "phút", "minuto", "dakika"], subtract: (date, value) => date.setUTCMinutes(date.getUTCMinutes() - value) },
    { words: ["hour", "giờ", "hora", "saat"], subtract: (date, value) => date.setUTCHours(date.getUTCHours() - value) },
    { words: ["day", "ngày", "día", "gün"], subtract: (date, value) => date.setUTCDate(date.getUTCDate() - value) },
    { words: ["week", "tuần", "semana", "hafta"], subtract: (date, value) => date.setUTCDate(date.getUTCDate() - value * 7) },
    { words: ["month", "tháng", "mes", "ay"], subtract: (date, value) => subtractMonths(date, value) },
    { words: ["year", "năm", "año", "yıl"], subtract: (date, value) => subtractMonths(date, value * 12) },
];

function matchesUnit(words: string[], word: string): boolean {
    return words.some((candidate) => (candidate.length > 2 ? word.startsWith(candidate) : word === candidate));
}

export function relativeDateIso(value: number, word: string): string | undefined {
    const unit = RELATIVE_UNITS.find(({ words }) => matchesUnit(words, word.toLowerCase()));
    if (!unit) return undefined;

    const date = new Date();
    date.setUTCMilliseconds(0);
    unit.subtract(date, value);

    return date.toISOString();
}
