import { create } from 'zustand'
import {
  EMPTY_SETTINGS,
  isFinalState,
  type AppSettings,
  type BackendEvent,
  type Collection,
  type CompleteResult,
  type EngineInfo,
  type ResolveResult,
  type SongMeta,
  type TrackState
} from '@shared/types'

export interface TrackItem extends SongMeta {
  selected: boolean
  state: TrackState
  progress: number
  speed: number | null
  eta: number | null
  message: string
  error?: string
  path?: string
}

interface EngineState {
  status: 'starting' | 'ready' | 'error'
  info: EngineInfo | null
  message: string
}

interface DownloadState {
  active: boolean
  status: string
  overall: number
  result: CompleteResult | null
  error: string | null
}

export interface Store {
  settings: AppSettings
  engine: EngineState
  urlsText: string
  resolving: boolean
  resolveMessage: string
  collections: Collection[]
  songs: TrackItem[]
  download: DownloadState
  advancedOpen: boolean
  appVersion: string

  set: (patch: Partial<Store>) => void
  setSettings: (settings: AppSettings) => void
  patchSettings: (patch: Partial<AppSettings>) => void
  setResolved: (result: ResolveResult) => void
  clearResults: () => void
  toggleSong: (url: string) => void
  setAllSelected: (selected: boolean) => void
  handleEvent: (event: BackendEvent) => void
}

function toTrack(song: SongMeta): TrackItem {
  return {
    ...song,
    selected: true,
    state: 'idle',
    progress: 0,
    speed: null,
    eta: null,
    message: ''
  }
}

export function overallProgress(songs: TrackItem[]): number {
  const selected = songs.filter((song) => song.selected)
  if (selected.length === 0) return 0
  const total = selected.reduce((sum, song) => {
    if (isFinalState(song.state)) return sum + 100
    return sum + Math.max(0, Math.min(100, song.progress))
  }, 0)
  return total / (selected.length * 100)
}

function summarize(result: CompleteResult): string {
  if (result.cancelled) {
    const saved = result.ok + result.skipped
    return `Stopped early — ${saved} of ${result.total} saved.`
  }
  const parts = [`${result.ok} downloaded`]
  if (result.skipped > 0) parts.push(`${result.skipped} already saved`)
  if (result.failed > 0) parts.push(`${result.failed} failed`)
  return parts.join(' · ')
}

export const useStore = create<Store>((set) => ({
  settings: EMPTY_SETTINGS,
  engine: { status: 'starting', info: null, message: 'Starting engine…' },
  urlsText: '',
  resolving: false,
  resolveMessage: '',
  collections: [],
  songs: [],
  download: { active: false, status: '', overall: 0, result: null, error: null },
  advancedOpen: false,
  appVersion: '',

  set: (patch) => set(patch),

  setSettings: (settings) => set({ settings }),

  patchSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),

  setResolved: (result) =>
    set({
      collections: result.collections,
      songs: result.songs.map(toTrack),
      download: { active: false, status: '', overall: 0, result: null, error: null }
    }),

  clearResults: () =>
    set({
      collections: [],
      songs: [],
      resolveMessage: '',
      download: { active: false, status: '', overall: 0, result: null, error: null }
    }),

  toggleSong: (url) =>
    set((state) => {
      if (state.download.active) return state
      const songs = state.songs.map((song) =>
        song.url === url ? { ...song, selected: !song.selected } : song
      )
      return { songs, download: { ...state.download, overall: overallProgress(songs) } }
    }),

  setAllSelected: (selected) =>
    set((state) => {
      if (state.download.active) return state
      const songs = state.songs.map((song) => ({ ...song, selected }))
      return { songs, download: { ...state.download, overall: overallProgress(songs) } }
    }),

  handleEvent: (event) =>
    set((state) => {
      switch (event.event) {
        case 'booting':
          return { engine: { ...state.engine, status: 'starting', message: 'Warming up…' } }

        case 'ready': {
          const info: EngineInfo = {
            spotdl: event.spotdl ?? 'unknown',
            ytdlp: event.ytdlp ?? null,
            python: event.python ?? '',
            ffmpeg: event.ffmpeg ?? { available: false, path: null, version: null }
          }
          return {
            engine: {
              status: 'ready',
              info,
              message: `spotdl ${info.spotdl}`
            }
          }
        }

        case 'engine-exit':
          return {
            engine: {
              ...state.engine,
              status: 'error',
              message: event.message ?? 'Engine stopped'
            },
            download: state.download.active
              ? {
                  ...state.download,
                  active: false,
                  error: event.message ?? 'The engine stopped.',
                  status: event.message ?? 'The engine stopped.'
                }
              : state.download
          }

        case 'resolving':
          return { resolving: true, resolveMessage: 'Reading your links…' }

        case 'progress':
          return {
            resolveMessage:
              event.message ??
              `Reading ${event.step ?? 1} of ${event.total ?? 1}…`
          }

        case 'track': {
          if (!event.url) return state
          const songs = state.songs.map((song) => {
            if (song.url !== event.url) return song
            const nextState = event.state ?? song.state
            const final = isFinalState(nextState)
            return {
              ...song,
              state: nextState,
              progress:
                typeof event.progress === 'number'
                  ? Math.max(0, Math.min(100, event.progress))
                  : song.progress,
              speed: final ? null : event.speed ?? null,
              eta: final ? null : event.eta ?? null,
              message: event.message ?? song.message,
              error: event.error ?? (final && nextState !== 'error' ? undefined : song.error),
              path: event.path ?? song.path
            }
          })
          return {
            songs,
            download: { ...state.download, overall: overallProgress(songs) }
          }
        }

        case 'download-start': {
          const songs = state.songs.map((song) =>
            song.selected
              ? {
                  ...song,
                  state: 'queued' as TrackState,
                  progress: 0,
                  error: undefined,
                  path: undefined,
                  speed: null,
                  eta: null,
                  message: 'Queued'
                }
              : song
          )
          return {
            songs,
            resolving: false,
            download: {
              active: true,
              status: 'Starting download…',
              overall: 0,
              result: null,
              error: null
            }
          }
        }

        case 'complete': {
          const result: CompleteResult = {
            total: event.total ?? 0,
            ok: event.ok ?? 0,
            failed: event.failed ?? 0,
            skipped: event.skipped ?? 0,
            cancelled: Boolean(event.cancelled)
          }
          const songs = state.songs.map((song) => {
            if (!song.selected) return song
            if (result.cancelled && !isFinalState(song.state)) {
              return { ...song, state: 'cancelled' as TrackState, message: 'Stopped' }
            }
            return song
          })
          const processed = result.ok + result.skipped + result.failed
          return {
            songs,
            download: {
              active: false,
              status: summarize(result),
              overall:
                result.cancelled && result.total > 0
                  ? processed / result.total
                  : overallProgress(songs),
              result,
              error: result.failed > 0 ? summarize(result) : null
            }
          }
        }

        case 'error': {
          if (state.download.active) {
            return {
              download: {
                ...state.download,
                active: false,
                error: event.message ?? 'Something went wrong.',
                status: event.message ?? 'Something went wrong.'
              }
            }
          }
          return { resolveMessage: event.message ?? 'Something went wrong.' }
        }

        default:
          return state
      }
    })
}))
