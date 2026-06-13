// Manifest types — mirrors docs/DESIGN_SPEC.md §10.

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
  client: string
  category: string
  year: number
  duration: string
  source: VideoSource
  /** Custom poster URL; empty string resolves per §10 rules */
  poster: string
  featured: boolean
}

export interface Manifest {
  videos: VideoEntry[]
}
