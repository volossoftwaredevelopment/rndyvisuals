// Manifest types — exact mirror of docs/DESIGN_SPEC.md §10 (src/data/videos.json).

export type SourceType = 'placeholder' | 'youtube' | 'vimeo' | 'file'

export interface VideoSource {
  type: SourceType
  /** YouTube / Vimeo video id. */
  id?: string
  /** Direct media URL for `type: "file"`. */
  url?: string
}

export interface VideoEntry {
  id: string
  title: string
  client: string
  category: string
  year: number
  duration: string
  source: VideoSource
  poster: string
  featured: boolean
}

export interface Manifest {
  videos: VideoEntry[]
}
