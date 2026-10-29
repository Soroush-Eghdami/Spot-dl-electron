import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  BITRATE_OPTIONS,
  EMPTY_SETTINGS,
  FORMAT_OPTIONS,
  PROVIDER_OPTIONS,
  type AppSettings
} from '@shared/types'

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function defaults(): AppSettings {
  return {
    ...EMPTY_SETTINGS,
    outputDir: path.join(app.getPath('downloads'), 'SpotifyDL')
  }
}

function sanitize(raw: Partial<AppSettings>, base: AppSettings): AppSettings {
  const merged = { ...base, ...raw }
  const formats = FORMAT_OPTIONS.map((f) => f.value)
  const providers = PROVIDER_OPTIONS.map((p) => p.value)

  if (!formats.includes(merged.format)) merged.format = base.format
  if (!providers.includes(merged.audioProvider)) merged.audioProvider = base.audioProvider
  if (!BITRATE_OPTIONS.includes(merged.bitrate)) merged.bitrate = base.bitrate
  if (merged.overwrite !== 'skip' && merged.overwrite !== 'force') merged.overwrite = 'skip'

  const threads = Number(merged.threads)
  merged.threads = Number.isFinite(threads) ? Math.min(16, Math.max(1, Math.round(threads))) : 4

  merged.outputDir = typeof merged.outputDir === 'string' ? merged.outputDir : base.outputDir
  merged.output =
    typeof merged.output === 'string' && merged.output.trim()
      ? merged.output.trim()
      : EMPTY_SETTINGS.output
  merged.spotifyClientId =
    typeof merged.spotifyClientId === 'string' ? merged.spotifyClientId.trim() : ''
  merged.spotifyClientSecret =
    typeof merged.spotifyClientSecret === 'string' ? merged.spotifyClientSecret.trim() : ''
  merged.useOfficialApi = Boolean(merged.useOfficialApi)
  merged.generateLrc = Boolean(merged.generateLrc)
  merged.skipAlbumArt = Boolean(merged.skipAlbumArt)

  return merged
}

let cached: AppSettings | null = null

export function loadSettings(): AppSettings {
  if (cached) return cached
  const base = defaults()
  try {
    const file = settingsFile()
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppSettings>
      cached = sanitize(raw, base)
    } else {
      cached = base
    }
  } catch {
    cached = base
  }
  return cached
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = sanitize(patch, loadSettings())
  cached = next
  try {
    const file = settingsFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  } catch {
    // A failed save shouldn't stop anything else.
  }
  return next
}
