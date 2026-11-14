export function cookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
}
