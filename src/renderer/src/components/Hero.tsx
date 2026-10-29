import { AudioLines, Settings2 } from 'lucide-react'
import type { Store } from '../store'

interface Props {
  engine: Store['engine']
  onOpenAdvanced: () => void
}

export function Hero({ engine, onOpenAdvanced }: Props): React.JSX.Element {
  const ready = engine.status === 'ready'
  const failed = engine.status === 'error'
  const dot = failed ? 'bg-clay' : ready ? 'bg-[#9db183]' : 'bg-sand pulse-dot'

  const detail = engine.info
    ? `spotdl ${engine.info.spotdl} · yt-dlp ${engine.info.ytdlp ?? 'n/a'} · ffmpeg ${
        engine.info.ffmpeg.available ? 'ready' : 'missing'
      }`
    : engine.message

  return (
    <header className="hero animate-rise px-6 py-5 sm:px-7 sm:py-6">
      <div className="relative z-10 flex items-center gap-3.5">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-clay shadow-[0_14px_28px_-12px_rgba(201,111,79,0.9)]">
          <AudioLines size={24} strokeWidth={2.2} />
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-sand/70">
            spotdl powered
          </p>
          <h1 className="font-display text-[25px] font-black leading-none tracking-[-0.02em] sm:text-[28px]">
            Spotify<span className="text-sand">DL</span>
          </h1>
        </div>

        <p className="ml-2 hidden max-w-[220px] text-[12px] leading-snug text-cream/55 lg:block">
          Keep your playlists with you — even when the internet isn&apos;t.
        </p>

        <div className="ml-auto flex items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-cream/85 backdrop-blur"
            title={detail}
          >
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <span className="hidden sm:inline">
              {failed ? 'Engine offline' : ready ? 'Engine ready' : 'Starting engine…'}
            </span>
            <span className="sm:hidden">{failed ? 'Offline' : ready ? 'Ready' : 'Starting'}</span>
          </div>

          <button
            type="button"
            onClick={onOpenAdvanced}
            className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold text-cream/85 transition hover:bg-white/15"
            title="Advanced settings"
          >
            <Settings2 size={13} />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 items-end gap-1.5 opacity-25 xl:flex">
        {[18, 30, 22, 40, 16, 34, 24].map((height, index) => (
          <span
            key={index}
            className="w-1.5 rounded-full bg-cream"
            style={{ height }}
          />
        ))}
      </div>
    </header>
  )
}
