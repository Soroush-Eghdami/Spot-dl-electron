export type TrackState =
  | 'idle'
  | 'queued'
  | 'searching'
  | 'metadata'
  | 'downloading'
  | 'converting'
  | 'done'
  | 'skipped'
  | 'error'
  | 'cancelled'

export type AudioFormat = 'mp3' | 'm4a' | 'flac' | 'ogg' | 'opus' | 'wav'

export type AudioProvider = 'youtube-music' | 'youtube' | 'soundcloud' | 'bandcamp' | 'piped'

export type LinkKind = 'track' | 'album' | 'playlist' | 'artist' | 'episode' | 'link'

export interface SongMeta {
  url: string
  id: string
  title: string
  artist: string
  artists: string[]
  album: string
  duration: number
  cover: string | null
  year: number
  explicit: boolean
  trackNumber: number
  listName: string | null
  listUrl: string | null
  listPosition: number | null
  listLength: number | null
  kind: LinkKind
}

export interface Collection {
  url: string
  kind: LinkKind
  name: string
  cover?: string | null
  count: number
  error?: string
}

export interface DownloadOptions {
  outputDir: string
  format: AudioFormat
  bitrate: string
  audioProvider: AudioProvider
  overwrite: 'skip' | 'force'
  threads: number
  generateLrc: boolean
  skipAlbumArt: boolean
  output: string
}

export interface AppSettings extends DownloadOptions {
  spotifyClientId: string
  spotifyClientSecret: string
  useOfficialApi: boolean
}

export interface SpotifyCredentials {
  clientId: string
  clientSecret: string
  useOfficialApi: boolean
}

export interface EngineInfo {
  spotdl: string
  ytdlp: string | null
  python: string
  ffmpeg: {
    available: boolean
    path: string | null
    version: string | null
  }
}

export interface ResolveResult {
  collections: Collection[]
  songs: SongMeta[]
}

export interface CompleteResult {
  total: number
  ok: number
  failed: number
  skipped: number
  cancelled: boolean
}

export interface BackendEvent {
  event: string
  id?: string
  message?: string
  url?: string
  state?: TrackState
  progress?: number
  speed?: number | null
  eta?: number | null
  error?: string
  path?: string
  detail?: string
  step?: number
  total?: number
  ok?: number
  failed?: number
  skipped?: number
  cancelled?: boolean
  outputDir?: string
  songs?: SongMeta[]
  collections?: Collection[]
  spotdl?: string
  ytdlp?: string | null
  python?: string
  ffmpeg?: EngineInfo['ffmpeg']
  data?: unknown
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const EMPTY_SETTINGS: AppSettings = {
  outputDir: '',
  format: 'mp3',
  bitrate: '320k',
  audioProvider: 'youtube-music',
  overwrite: 'skip',
  threads: 4,
  generateLrc: false,
  skipAlbumArt: false,
  output: '{artists} - {title}.{output-ext}',
  spotifyClientId: '',
  spotifyClientSecret: '',
  useOfficialApi: false
}

export const FORMAT_OPTIONS: { value: AudioFormat; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' },
  { value: 'ogg', label: 'OGG' },
  { value: 'opus', label: 'OPUS' }
]

export const BITRATE_OPTIONS = ['128k', '192k', '256k', '320k']

export const PROVIDER_OPTIONS: { value: AudioProvider; label: string }[] = [
  { value: 'youtube-music', label: 'YouTube Music' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'soundcloud', label: 'SoundCloud' },
  { value: 'bandcamp', label: 'Bandcamp' },
  { value: 'piped', label: 'Piped' }
]

export const LOSSLESS_FORMATS: AudioFormat[] = ['flac', 'wav']

export function isFinalState(state: TrackState): boolean {
  return state === 'done' || state === 'skipped' || state === 'error' || state === 'cancelled'
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  const total = Math.round(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    return `${hours}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function formatSpeed(bytesPerSecond?: number | null): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return ''
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let value = bytesPerSecond
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function parseSpotifyLinks(text: string): string[] {
  const links: string[] = []
  for (const raw of text.split(/\r?\n|,/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('spotify:')) {
      const parts = line.split(':')
      if (parts.length >= 3) {
        links.push(`https://open.spotify.com/${parts[1]}/${parts[2].split('?')[0]}`)
      }
      continue
    }
    if (/^https?:\/\/(open\.)?spotify\.com\//i.test(line)) {
      links.push(line)
    }
  }
  return [...new Set(links)]
}

export function cleanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim()
}
