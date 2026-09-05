export function wait(delay: number): void {
    const end = Date.now() + delay;
    while (Date.now() < end) {}
}