import { useEffect, useState } from 'react'
import { Eye, EyeOff, ExternalLink, KeyRound, X } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { Toggle } from './Toggle'

interface Props {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onSave: (settings: AppSettings) => void
}

export function AdvancedDialog({
  open,
  settings,
  onClose,
  onSave
}: Props): React.JSX.Element | null {
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(settings)
      setShowSecret(false)
    }
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const patch = (next: Partial<AppSettings>): void => setDraft((prev) => ({ ...prev, ...next }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-forest/45 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Advanced settings"
        onClick={(event) => event.stopPropagation()}
        className="animate-rise max-h-full w-full max-w-[540px] overflow-y-auto rounded-3xl border border-sand bg-[#FFFDF7] p-6 shadow-[0_40px_80px_-30px_rgba(46,58,47,0.6)]"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-moss/12 text-moss">
            <KeyRound size={18} />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-[18px] font-extrabold tracking-tight">
              Advanced settings
            </h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-moss">
              Optional Spotify API keys and filename tweaks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-moss transition hover:bg-sand/40 hover:text-forest"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-sand/80 bg-sand/12 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold">Use the official Spotify API</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-moss/85">
                The shared public keys can hit rate limits. Your own app credentials are faster
                and more reliable.
              </p>
            </div>
            <Toggle
              checked={draft.useOfficialApi}
              onChange={(next) => patch({ useOfficialApi: next })}
              label="Use official Spotify API"
            />
          </div>

          <button
            type="button"
            onClick={() => window.api.openExternal('https://developer.spotify.com/dashboard')}
            className="mt-2.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-clay hover:underline"
          >
            Create a free Spotify app <ExternalLink size={11} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="client-id">
              Client ID
            </label>
            <input
              id="client-id"
              value={draft.spotifyClientId}
              onChange={(event) => patch({ spotifyClientId: event.target.value })}
              placeholder="Paste your client ID"
              spellCheck={false}
              className="field mt-1.5 font-mono text-[11.5px]"
            />
          </div>

          <div>
            <label className="label" htmlFor="client-secret">
              Client secret
            </label>
            <div className="relative mt-1.5">
              <input
                id="client-secret"
                type={showSecret ? 'text' : 'password'}
                value={draft.spotifyClientSecret}
                onChange={(event) => patch({ spotifyClientSecret: event.target.value })}
                placeholder="Paste your client secret"
                spellCheck={false}
                className="field pr-10 font-mono text-[11.5px]"
              />
              <button
                type="button"
                onClick={() => setShowSecret((value) => !value)}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-moss transition hover:bg-sand/40"
                aria-label={showSecret ? 'Hide secret' : 'Show secret'}
              >
                {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-moss/70">
              Add <span className="font-mono">http://localhost:8888/callback</span> as a redirect
              URI in your Spotify app.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="threads">
                Workers
              </label>
              <input
                id="threads"
                type="number"
                min={1}
                max={16}
                value={draft.threads}
                onChange={(event) => patch({ threads: Number(event.target.value) })}
                className="field mt-1.5 text-[12px]"
              />
            </div>
            <div>
              <label className="label" htmlFor="template">
                Filename template
              </label>
              <input
                id="template"
                value={draft.output}
                onChange={(event) => patch({ output: event.target.value })}
                spellCheck={false}
                className="field mt-1.5 font-mono text-[11px]"
              />
            </div>
          </div>
          <p className="text-[10px] leading-snug text-moss/70">
            Template variables: <span className="font-mono">{'{artists}'}</span>,{' '}
            <span className="font-mono">{'{title}'}</span>,{' '}
            <span className="font-mono">{'{album}'}</span>,{' '}
            <span className="font-mono">{'{track-number}'}</span>,{' '}
            <span className="font-mono">{'{output-ext}'}</span>.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost px-4 py-2 text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="btn btn-clay px-5 py-2 text-[12px]"
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  )
}
