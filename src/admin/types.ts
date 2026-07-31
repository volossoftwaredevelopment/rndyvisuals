// Manifest types — mirror of src/types.ts (src/data/videos.json). The live site
// shows the title only; client/category/year/duration feed the generated
// placeholder art and are optional, kept here so the admin round-trips them.

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
  source: VideoSource
  poster: string
  featured: boolean
  caption?: string
  client?: string
  category?: string
  year?: number
  duration?: string
}

export interface Manifest {
  videos: VideoEntry[]
}
