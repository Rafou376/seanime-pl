export function toArray(selection: DocSelection): DocSelection[] {
    const items: DocSelection[] = [];

    selection.each((_, item) => {
        items.push(item);
    });

    return items;
}

export function scriptContaining(html: string, needle: string | RegExp): string | null {
    const script = LoadDoc(html)("script")
        .filter((_, element) => (typeof needle === "string" ? element.text().includes(needle) : needle.test(element.text())))
        .first();

    return script.length() > 0 ? script.text() : null;
}

export function firstText(html: string, selector: string): string | null {
    const script = LoadDoc(html)(selector).first();

    return script.length() > 0 ? script.text() : null;
}
