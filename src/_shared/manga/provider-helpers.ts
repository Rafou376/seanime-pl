export const ANY_NUMBER_RE = /(\d+(?:\.\d+)?)/;

const DEFAULT_NUMBER_RES = [ANY_NUMBER_RE];

export function matchChapterNumber(source: string, patterns: RegExp[] = DEFAULT_NUMBER_RES): string | null {
    for (const re of patterns) {
        const number = re.exec(source)?.[1];
        if (number) return number;
    }

    return null;
}

function chapterOrderValue(chapter: string): number {
    const value = parseFloat(chapter);
    return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export function sortChapters<T extends { chapter: string }>(chapters: T[]): (T & { index: number })[] {
    return chapters
        .map((chapter) => ({ chapter, order: chapterOrderValue(chapter.chapter) }))
        .sort((a, b) => (a.order === b.order ? 0 : a.order - b.order))
        .map(({ chapter }, index) => ({ ...chapter, index }));
}
