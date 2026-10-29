import { ClipboardPaste, Link2, Loader2, Search, X } from 'lucide-react'
import { parseSpotifyLinks } from '@shared/types'

interface Props {
  value: string
  onChange: (value: string) => void
  onResolve: () => void
  onPaste: () => void
  onClear: () => void
  resolving: boolean
  message: string
}

export function LinkCard({
  value,
  onChange,
  onResolve,
  onPaste,
  onClear,
  resolving,
  message
}: Props): React.JSX.Element {
  const detected = parseSpotifyLinks(value).length

  return (
    <section className="card animate-rise p-5" style={{ animationDelay: '60ms' }}>
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-moss/12 text-moss">
          <Link2 size={17} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-[14px] font-extrabold tracking-tight">Paste your Spotify links</h2>
          <p className="text-[11px] text-moss/80">
            Tracks, albums, playlists or artists — one per line.
          </p>
        </div>

        {detected > 0 && (
          <span className="ml-auto rounded-full bg-moss/10 px-2.5 py-1 text-[10.5px] font-bold text-moss">
            {detected} {detected === 1 ? 'link' : 'links'}
          </span>
        )}
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            onResolve()
          }
        }}
        rows={4}
        spellCheck={false}
        placeholder={
          'https://open.spotify.com/track/…\nhttps://open.spotify.com/playlist/…'
        }
        className="field mt-3 min-h-[104px] resize-y rounded-2xl px-3.5 py-3 font-mono text-[12px] leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onResolve}
          disabled={resolving}
          className="btn btn-moss px-4 py-2 text-[12.5px]"
        >
          {resolving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Search size={15} />
          )}
          {resolving ? 'Resolving…' : 'Resolve links'}
        </button>

        <button type="button" onClick={onPaste} className="btn btn-ghost px-3 py-2 text-[12px]">
          <ClipboardPaste size={14} />
          Paste
        </button>

        <button type="button" onClick={onClear} className="btn btn-ghost px-3 py-2 text-[12px]">
          <X size={14} />
          Clear
        </button>

        <span
          className={`ml-auto text-[11px] font-medium ${
            resolving ? 'text-clay' : 'text-moss/80'
          }`}
        >
          {message || 'Tip: Ctrl + Enter to resolve'}
        </span>
      </div>
    </section>
  )
}
