// Manifest types. Grid films use type 'file' (self-hosted) or youtube/vimeo.
// client/category/year/duration are optional — tiles show the title only.

export type SourceType = 'placeholder' | 'youtube' | 'vimeo' | 'file'

export interface VideoSource {
  type: SourceType
  /** YouTube / Vimeo id (when type is 'youtube' | 'vimeo') */
  id?: string
  /** Direct media URL (when type is 'file') */
  url?: string
}

export interface VideoEntry {
  id: string
  title: string
  source: VideoSource
  /** Poster URL; empty string resolves per resolution rules */
  poster: string
  featured: boolean
  /** optional caption shown under the tile / in the player (no brands, no buzzwords) */
  caption?: string
  client?: string
  category?: string
  year?: number
  duration?: string
}

export interface Manifest {
  videos: VideoEntry[]
}
