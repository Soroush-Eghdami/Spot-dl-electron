import {
  AlertTriangle,
  Check,
  CheckCheck,
  CheckCircle2,
  Disc3,
  ListMusic,
  Loader2,
  Music2
} from 'lucide-react'
import { formatDuration, formatSpeed, type Collection, type TrackState } from '@shared/types'
import type { TrackItem } from '../store'
import { CoverArt } from './CoverArt'

interface Props {
  songs: TrackItem[]
  collections: Collection[]
  active: boolean
  onToggle: (url: string) => void
  onSelectAll: (selected: boolean) => void
}

const ACTIVE_STATES: TrackState[] = [
  'queued',
  'searching',
  'metadata',
  'downloading',
  'converting'
]

function StateBadge({ song }: { song: TrackItem }): React.JSX.Element {
  switch (song.state) {
    case 'queued':
      return <span className="text-[10.5px] font-semibold text-moss/70">Queued</span>
    case 'searching':
    case 'metadata':
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-moss">
          <Loader2 size={11} className="animate-spin" /> Matching
        </span>
      )
    case 'downloading':
      return (
        <span className="block">
          <span className="block text-[12px] font-extrabold tabular-nums text-clay">
            {Math.round(song.progress)}%
          </span>
          <span className="block truncate text-[9.5px] font-medium text-moss/75">
            {formatSpeed(song.speed) ||
              (song.eta ? `${song.eta}s left` : 'Downloading')}
          </span>
        </span>
      )
    case 'converting':
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-clay">
          <Loader2 size={11} className="animate-spin" /> Tagging
        </span>
      )
    case 'done':
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-moss">
          <CheckCircle2 size={13} /> Done
        </span>
      )
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-moss/80">
          <CheckCheck size={13} /> Saved
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-clay">
          <AlertTriangle size={12} /> Failed
        </span>
      )
    case 'cancelled':
      return <span className="text-[10.5px] font-semibold text-moss/60">Stopped</span>
    default:
      return <span className="text-[10.5px] font-medium text-moss/35">Ready</span>
  }
}

export function TrackList({
  songs,
  collections,
  active,
  onToggle,
  onSelectAll
}: Props): React.JSX.Element {
  const selected = songs.filter((song) => song.selected)
  const allSelected = songs.length > 0 && selected.length === songs.length
  const totalDuration = selected.reduce((sum, song) => sum + song.duration, 0)

  return (
    <section className="card animate-rise mt-4 overflow-hidden" style={{ animationDelay: '120ms' }}>
      <div className="flex items-center gap-3 border-b border-sand/60 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-sand/45 text-forest/70">
          <ListMusic size={17} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-[14px] font-extrabold tracking-tight">Your queue</h2>
          <p className="text-[11px] text-moss/80">
            {songs.length > 0
              ? `${songs.length} tracks · ${formatDuration(totalDuration)} selected`
              : 'Resolved tracks will show up here'}
          </p>
        </div>

        {songs.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectAll(!allSelected)}
            disabled={active}
            className="ml-auto flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold text-moss transition hover:text-forest disabled:opacity-40"
          >
            <span className={`check ${allSelected ? 'check-on' : ''}`}>
              {allSelected && <Check size={11} strokeWidth={3} />}
            </span>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      {collections.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-sand/45 px-5 py-2.5">
          {collections.map((collection) => (
            <span
              key={collection.url}
              title={collection.error ?? collection.url}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[10.5px] font-semibold ${
                collection.error
                  ? 'border-clay/25 bg-clay/8 text-clay'
                  : 'border-sand/70 bg-white/55 text-forest/75'
              }`}
            >
              {collection.error ? (
                <AlertTriangle size={13} />
              ) : collection.cover ? (
                <CoverArt src={collection.cover} size={18} className="rounded-md" />
              ) : (
                <Music2 size={13} />
              )}
              <span className="max-w-[190px] truncate">{collection.name}</span>
              {!collection.error && (
                <span className="rounded-full bg-sand/55 px-1.5 py-0.5 text-[9px] font-bold text-forest/60">
                  {collection.count}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {songs.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-sand/40 text-moss">
            <Disc3 size={30} strokeWidth={1.6} />
          </div>
          <p className="mt-4 text-[15px] font-bold">Nothing here yet</p>
          <p className="mx-auto mt-1 max-w-[320px] text-[12px] leading-relaxed text-moss/85">
            Paste a link above and hit <span className="font-semibold">Resolve</span>. Choose the
            tracks you want, then download them.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-1.5">
            {['Track', 'Album', 'Playlist', 'Artist'].map((kind) => (
              <span key={kind} className="chip">
                {kind}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="max-h-[440px] overflow-y-auto">
          {songs.map((song, index) => {
            const isActive = ACTIVE_STATES.includes(song.state)
            return (
              <div
                key={song.url}
                role="button"
                tabIndex={active ? -1 : 0}
                aria-pressed={song.selected}
                aria-disabled={active}
                onClick={() => !active && onToggle(song.url)}
                onKeyDown={(event) => {
                  if (active) return
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onToggle(song.url)
                  }
                }}
                className={`track-row flex items-center gap-3 border-b border-sand/30 px-5 py-2.5 outline-none last:border-b-0 focus-visible:bg-sand/20 ${
                  song.selected ? 'is-selected' : ''
                } ${isActive ? 'is-active' : ''} ${active ? 'cursor-default' : 'cursor-pointer'}`}
                style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
              >
                <span className={`check ${song.selected ? 'check-on' : ''}`}>
                  {song.selected && <Check size={11} strokeWidth={3} />}
                </span>

                <CoverArt src={song.cover} alt={song.title} size={42} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="truncate text-[13px] font-semibold tracking-[-0.01em]">
                      {song.title}
                    </p>
                    {song.explicit && (
                      <span className="shrink-0 rounded bg-sand/70 px-1 text-[8.5px] font-black text-forest/70">
                        E
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-moss/70">
                      {formatDuration(song.duration)}
                    </span>
                  </div>

                  <p className="truncate text-[11.5px] text-moss">
                    {song.artists.join(', ')}
                    {song.album ? <span className="text-moss/65"> · {song.album}</span> : null}
                  </p>

                  {isActive && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className={`bar h-1.5 flex-1 ${song.state === 'queued' ? 'sheen' : ''}`}>
                        <span
                          className="bar-fill"
                          style={{ width: `${song.state === 'queued' ? 0 : song.progress}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[9.5px] font-semibold text-moss/75">
                        {song.state === 'downloading'
                          ? formatSpeed(song.speed) ||
                            (song.eta ? `${song.eta}s left` : 'Downloading')
                          : song.state === 'converting'
                            ? 'Converting'
                            : song.state === 'queued'
                              ? 'Waiting'
                              : 'Finding audio'}
                      </span>
                    </div>
                  )}

                  {song.state === 'error' && song.error && (
                    <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-clay">
                      {song.error}
                    </p>
                  )}
                </div>

                <div className="w-[78px] shrink-0 text-right">
                  <StateBadge song={song} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
