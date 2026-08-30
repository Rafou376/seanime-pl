export type ExtractorResult = {
    sources: VideoSource[]
    headers?: { [key: string]: string }
}

export type Extractor = (playerUrl: string, label: string) => Promise<ExtractorResult>
