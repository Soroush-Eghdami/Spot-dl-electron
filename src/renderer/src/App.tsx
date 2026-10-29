import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  cleanError,
  parseSpotifyLinks,
  type AppSettings,
  type DownloadOptions
} from '@shared/types'
import { useStore } from './store'
import { Hero } from './components/Hero'
import { LinkCard } from './components/LinkCard'
import { TrackList } from './components/TrackList'
import { SettingsPanel } from './components/SettingsPanel'
import { DownloadCard } from './components/DownloadCard'
import { AdvancedDialog } from './components/AdvancedDialog'

export default function App(): React.JSX.Element {
  const state = useStore()
  const settings = state.settings
  const selectedSongs = state.songs.filter((song) => song.selected)
  const totalDuration = selectedSongs.reduce((sum, song) => sum + song.duration, 0)
  const ffmpegOk = state.engine.info?.ffmpeg.available ?? true

  useEffect(() => {
    let alive = true
    const unsubscribe = window.api.onEvent((event) => {
      useStore.getState().handleEvent(event)
    })

    void (async () => {
      try {
        const [loaded, version] = await Promise.all([
          window.api.getSettings(),
          window.api.appVersion()
        ])
        if (!alive) return
        useStore.getState().setSettings(loaded)
        useStore.getState().set({ appVersion: version })
      } catch {
        // Settings are optional; the app still works with defaults.
      }

      try {
        const ping = await window.api.ping()
        if (!alive) return
        if (ping.ok) {
          useStore.getState().handleEvent({ event: 'ready', ...ping.data })
        } else {
          useStore.getState().handleEvent({ event: 'engine-exit', message: ping.error })
        }
      } catch (error) {
        if (!alive) return
        useStore.getState().handleEvent({ event: 'engine-exit', message: cleanError(error) })
      }
    })()

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  const updateSettings = async (patch: Partial<AppSettings>): Promise<void> => {
    useStore.getState().patchSettings(patch)
    try {
      const saved = await window.api.saveSettings(patch)
      useStore.getState().setSettings(saved)
    } catch {
      // Keep the optimistic value if writing the settings file failed.
    }
  }

  const handleResolve = async (): Promise<void> => {
    const store = useStore.getState()
    const urls = parseSpotifyLinks(store.urlsText)
    if (urls.length === 0) {
      store.set({ resolveMessage: 'Paste at least one Spotify link first.' })
      return
    }

    store.set({
      resolving: true,
      resolveMessage: 'Connecting to Spotify…',
      collections: [],
      songs: [],
      download: { active: false, status: '', overall: 0, result: null, error: null }
    })

    const result = await window.api.resolve(urls)
    if (result.ok) {
      const next = useStore.getState()
      next.setResolved(result.data)
      next.set({
        resolving: false,
        resolveMessage: result.data.songs.length
          ? `Found ${result.data.songs.length} ${
              result.data.songs.length === 1 ? 'track' : 'tracks'
            }`
          : ''
      })
    } else {
      useStore.getState().set({ resolving: false, resolveMessage: result.error })
    }
  }

  const handlePaste = async (): Promise<void> => {
    try {
      const text = await window.api.readClipboard()
      if (!text.trim()) {
        useStore.getState().set({ resolveMessage: 'Your clipboard is empty.' })
        return
      }
      const store = useStore.getState()
      store.set({
        urlsText: store.urlsText.trim() ? `${store.urlsText.trim()}\n${text.trim()}` : text.trim(),
        resolveMessage: ''
      })
    } catch {
      useStore.getState().set({ resolveMessage: 'Could not read the clipboard.' })
    }
  }

  const handleClear = (): void => {
    const store = useStore.getState()
    store.clearResults()
    store.set({ urlsText: '' })
  }

  const handleDownload = async (): Promise<void> => {
    const store = useStore.getState()
    const songs = store.songs.filter((song) => song.selected)
    if (songs.length === 0) return

    const options: DownloadOptions = {
      outputDir: store.settings.outputDir,
      format: store.settings.format,
      bitrate: store.settings.bitrate,
      audioProvider: store.settings.audioProvider,
      overwrite: store.settings.overwrite,
      threads: store.settings.threads,
      generateLrc: store.settings.generateLrc,
      skipAlbumArt: store.settings.skipAlbumArt,
      output: store.settings.output
    }

    store.set({
      download: {
        active: true,
        status: 'Starting download…',
        overall: 0,
        result: null,
        error: null
      }
    })

    const result = await window.api.download(
      songs.map((song) => song.url),
      options
    )

    if (!result.ok) {
      useStore.getState().handleEvent({ event: 'error', message: result.error })
    } else {
      useStore.getState().handleEvent({ event: 'complete', ...result.data })
    }
  }

  const handleCancel = async (): Promise<void> => {
    const store = useStore.getState()
    store.set({ download: { ...store.download, status: 'Stopping after this track…' } })
    await window.api.cancel()
  }

  const handleOpenFolder = async (): Promise<void> => {
    const dir = useStore.getState().settings.outputDir
    if (dir) await window.api.openPath(dir)
  }

  const handleSaveAdvanced = async (draft: AppSettings): Promise<void> => {
    try {
      const saved = await window.api.saveSettings(draft)
      useStore.getState().setSettings(saved)
    } catch {
      useStore.getState().setSettings(draft)
    }
    useStore.getState().set({ advancedOpen: false })
  }

  const retryEngine = async (): Promise<void> => {
    const store = useStore.getState()
    store.set({ engine: { ...store.engine, status: 'starting', message: 'Reconnecting…' } })
    const ping = await window.api.ping()
    if (ping.ok) {
      store.handleEvent({ event: 'ready', ...ping.data })
    } else {
      store.handleEvent({ event: 'engine-exit', message: ping.error })
    }
  }

  return (
    <div className="min-h-full px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1200px]">
        <Hero engine={state.engine} onOpenAdvanced={() => state.set({ advancedOpen: true })} />

        {state.engine.status === 'error' && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-clay/25 bg-clay/8 px-4 py-2.5 text-[11.5px] text-clay">
            <TriangleAlert size={15} className="shrink-0" />
            <p className="min-w-0 flex-1 truncate">
              Download engine offline — {state.engine.message}
            </p>
            <button
              type="button"
              onClick={retryEngine}
              className="rounded-full border border-clay/30 px-3 py-1 text-[10.5px] font-bold transition hover:bg-clay/10"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_352px]">
          <div className="min-w-0">
            <LinkCard
              value={state.urlsText}
              onChange={(value) => state.set({ urlsText: value })}
              onResolve={handleResolve}
              onPaste={handlePaste}
              onClear={handleClear}
              resolving={state.resolving}
              message={state.resolveMessage}
            />

            <TrackList
              songs={state.songs}
              collections={state.collections}
              active={state.download.active}
              onToggle={state.toggleSong}
              onSelectAll={state.setAllSelected}
            />

            <p className="mt-4 px-3 text-center text-[9.5px] leading-relaxed text-moss/60">
              For music you own or have permission to download. Please respect Spotify&apos;s terms
              and copyright law.
            </p>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <SettingsPanel
              settings={settings}
              disabled={state.download.active}
              onChange={updateSettings}
              onPickFolder={async () => {
                const dir = await window.api.pickFolder()
                if (dir) await updateSettings({ outputDir: dir })
              }}
              onOpenFolder={handleOpenFolder}
              onAdvanced={() => state.set({ advancedOpen: true })}
            />

            <DownloadCard
              selectedCount={selectedSongs.length}
              totalDuration={totalDuration}
              download={state.download}
              ffmpegOk={ffmpegOk}
              formatLabel={settings.format.toUpperCase()}
              onDownload={handleDownload}
              onCancel={handleCancel}
              onOpenFolder={handleOpenFolder}
            />
          </aside>
        </div>
      </div>

      <AdvancedDialog
        open={state.advancedOpen}
        settings={settings}
        onClose={() => state.set({ advancedOpen: false })}
        onSave={handleSaveAdvanced}
      />
    </div>
  )
}
