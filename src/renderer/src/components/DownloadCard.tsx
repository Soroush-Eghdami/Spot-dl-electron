import { Download, FolderOpen, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { Store } from '../store'

interface Props {
  selectedCount: number
  totalDuration: number
  download: Store['download']
  ffmpegOk: boolean
  formatLabel: string
  onDownload: () => void
  onCancel: () => void
  onOpenFolder: () => void
}

export function DownloadCard({
  selectedCount,
  totalDuration,
  download,
  ffmpegOk,
  formatLabel,
  onDownload,
  onCancel,
  onOpenFolder
}: Props): React.JSX.Element {
  const percent = Math.round(download.overall * 100)
  const minutes = Math.round(totalDuration / 60)
  const durationLabel =
    minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`

  return (
    <section className="card animate-rise overflow-hidden" style={{ animationDelay: '150ms' }}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label">Ready to save</p>
            <p className="mt-1 font-display text-[28px] font-black leading-none">
              {selectedCount}
              <span className="ml-1.5 text-[12px] font-semibold text-moss">
                {selectedCount === 1 ? 'track' : 'tracks'}
              </span>
            </p>
          </div>
          <div className="text-right">
            <span className="chip">{formatLabel}</span>
            {selectedCount > 0 && (
              <p className="mt-1 text-[10.5px] font-medium text-moss/75">≈ {durationLabel}</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[10.5px] font-semibold">
            <span className="text-moss">
              {download.active ? 'Downloading' : download.result ? 'Finished' : 'Progress'}
            </span>
            <span className="tabular-nums text-forest">{percent}%</span>
          </div>
          <div className={`bar mt-1.5 ${download.active ? 'sheen' : ''}`}>
            <span className="bar-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {!ffmpegOk && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-clay/25 bg-clay/8 px-3 py-2">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-clay" />
            <p className="text-[10.5px] leading-snug text-clay">
              ffmpeg is missing. Conversions will fail — install ffmpeg and restart the app.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={onDownload}
          disabled={selectedCount === 0 || download.active}
          className="btn btn-clay mt-4 w-full py-3.5 text-[13.5px]"
        >
          {download.active ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Downloading {percent}%
            </>
          ) : (
            <>
              <Download size={16} />
              {selectedCount === 0 ? 'Pick some tracks' : `Download ${selectedCount} tracks`}
            </>
          )}
        </button>

        {download.active && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost mt-2 w-full py-2 text-[11.5px]"
          >
            Cancel download
          </button>
        )}

        {!download.active && download.result && (
          <button
            type="button"
            onClick={onOpenFolder}
            className="btn btn-ghost mt-2 w-full py-2 text-[11.5px]"
          >
            <FolderOpen size={14} />
            Open download folder
          </button>
        )}

        {download.status && (
          <p
            className={`mt-3 text-center text-[10.5px] leading-snug ${
              download.error ? 'text-clay' : 'text-moss'
            }`}
          >
            {download.status}
          </p>
        )}
      </div>

      <div className="border-t border-sand/60 bg-sand/15 px-5 py-2.5">
        <p className="flex items-center justify-center gap-1.5 text-[9.5px] font-medium text-moss/75">
          <ShieldCheck size={12} /> Your downloads stay on this PC.
        </p>
      </div>
    </section>
  )
}
