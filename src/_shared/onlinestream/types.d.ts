declare type ExtractorResult = {
    sources: VideoSource[]
    headers?: { [key: string]: string }
}

declare type Extractor = (playerUrl: string, label: string) => Promise<ExtractorResult>

declare module "virtual:extractors-map" {
    export const EXTRACTORS: Record<string, Extractor>;
}
