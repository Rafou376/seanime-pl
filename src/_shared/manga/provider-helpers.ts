export function matchChapterNumber(source: string, patterns: RegExp[] = [/(\d+(?:\.\d+)?)/]): string | null {
    for (const re of patterns) {
        const number = re.exec(source)?.[1];
        if (number) return number;
    }

    return null;
}

export function chapterOrderValue(chapter: string): number {
    const value = parseFloat(chapter);
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export function sortChapters<T extends { chapter: string }>(chapters: T[]): (T & { index: number })[] {
    return [...chapters]
        .sort((a, b) => {
            const left = chapterOrderValue(a.chapter);
            const right = chapterOrderValue(b.chapter);

            return left === right ? 0 : left - right;
        })
        .map((chapter, index) => ({ ...chapter, index }));
}
