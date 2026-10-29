import {
  AudioLines,
  ChevronDown,
  FolderOpen,
  FolderSearch,
  Settings2,
  Sparkles
} from 'lucide-react'
import {
  BITRATE_OPTIONS,
  FORMAT_OPTIONS,
  LOSSLESS_FORMATS,
  PROVIDER_OPTIONS,
  type AppSettings
} from '@shared/types'
import { Toggle } from './Toggle'

interface Props {
  settings: AppSettings
  disabled: boolean
  onChange: (patch: Partial<AppSettings>) => void
  onPickFolder: () => void
  onOpenFolder: () => void
  onAdvanced: () => void
}

interface ToggleRowProps {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-cream">{label}</p>
        <p className="mt-0.5 text-[10.5px] leading-snug text-sand/60">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  )
}

export function SettingsPanel({
  settings,
  disabled,
  onChange,
  onPickFolder,
  onOpenFolder,
  onAdvanced
}: Props): React.JSX.Element {
  const lossless = LOSSLESS_FORMATS.includes(settings.format)

  return (
    <section className="card animate-rise p-5" style={{ animationDelay: '90ms' }}>
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-cream/8 text-sand/70">
          <Sparkles size={16} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-[14px] font-extrabold tracking-tight">Download settings</h2>
          <p className="text-[11px] text-sand/60">Fine-tune the output to your taste.</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <span className="label">Format</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-sand/45">
              {lossless ? 'Lossless' : 'Compressed'}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {FORMAT_OPTIONS.map((format) => (
              <button
                key={format.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ format: format.value })}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                  settings.format === format.value
                    ? 'border-cream bg-cream text-forest shadow-sm'
                    : 'border-sand/15 bg-cream/5 text-sand/70 hover:border-moss/60 hover:text-cream'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {format.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="label">Bitrate</span>
            {lossless && <span className="text-[9.5px] text-sand/45">Not used for lossless</span>}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {BITRATE_OPTIONS.map((bitrate) => (
              <button
                key={bitrate}
                type="button"
                disabled={disabled || lossless}
                onClick={() => onChange({ bitrate })}
                className={`rounded-lg border px-1 py-1.5 text-[10.5px] font-bold transition ${
                  settings.bitrate === bitrate && !lossless
                    ? 'border-moss bg-moss/40 text-cream'
                    : 'border-sand/15 bg-cream/5 text-sand/70 hover:border-moss/60'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {bitrate.replace('k', '')}
                <span className="ml-0.5 text-[8.5px] font-semibold">k</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="provider" className="label">
            Audio source
          </label>
          <div className="relative mt-2">
            <select
              id="provider"
              value={settings.audioProvider}
              disabled={disabled}
              onChange={(event) =>
                onChange({ audioProvider: event.target.value as AppSettings['audioProvider'] })
              }
              className="select text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sand/75"
            />
          </div>
        </div>

        <div>
          <span className="label">Save to</span>
          <div className="mt-2 rounded-xl border border-sand/15 bg-cream/5 p-2.5">
            <div className="flex items-center gap-2">
              <FolderOpen size={14} className="shrink-0 text-sand/75" />
              <p
                title={settings.outputDir}
                className="min-w-0 flex-1 truncate text-[11px] text-sand/70"
              >
                {settings.outputDir || 'Choose a folder…'}
              </p>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={onPickFolder}
                disabled={disabled}
                className="btn btn-ghost flex-1 py-1.5 text-[10.5px]"
              >
                Change folder
              </button>
              <button
                type="button"
                onClick={onOpenFolder}
                disabled={!settings.outputDir}
                className="btn btn-ghost px-2.5 py-1.5"
                title="Open download folder"
              >
                <FolderSearch size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="h-px bg-cream/10" />

        <ToggleRow
          label="Skip existing files"
          hint="Never overwrite a track you already saved."
          checked={settings.overwrite === 'skip'}
          disabled={disabled}
          onChange={(next) => onChange({ overwrite: next ? 'skip' : 'force' })}
        />

        <ToggleRow
          label="Save lyrics"
          hint="Write a .lrc file next to the track when available."
          checked={settings.generateLrc}
          disabled={disabled}
          onChange={(next) => onChange({ generateLrc: next })}
        />
      </div>

      <button
        type="button"
        onClick={onAdvanced}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sand/20 py-2 text-[11px] font-semibold text-sand/75 transition hover:border-moss/60 hover:bg-cream/[0.04]"
      >
        <Settings2 size={13} />
        Advanced &amp; Spotify API
      </button>

      <p className="mt-3 flex items-center justify-center gap-1 text-[9.5px] text-sand/45">
        <AudioLines size={11} /> Powered by spotdl &amp; yt-dlp
      </p>
    </section>
  )
}
