declare module "virtual:website" {
    export const WEBSITE: string;
}

declare class URLSearchParams {
    constructor(init?: string | Record<string, string> | string[][] | URLSearchParams)
    append(name: string, value: string): void
    delete(name: string): void
    get(name: string): string | null
    getAll(name: string): string[]
    has(name: string): boolean
    set(name: string, value: string): void
    toString(): string
}
