import { contextBridge, ipcRenderer } from 'electron'
import type {
  ApiResult,
  AppSettings,
  BackendEvent,
  CompleteResult,
  DownloadOptions,
  EngineInfo,
  ResolveResult
} from '@shared/types'

const api = {
  ping: (): Promise<ApiResult<EngineInfo>> => ipcRenderer.invoke('engine:ping'),
  resolve: (urls: string[]): Promise<ApiResult<ResolveResult>> =>
    ipcRenderer.invoke('engine:resolve', urls),
  download: (urls: string[], options: DownloadOptions): Promise<ApiResult<CompleteResult>> =>
    ipcRenderer.invoke('engine:download', urls, options),
  cancel: (): Promise<ApiResult<null>> => ipcRenderer.invoke('engine:cancel'),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),

  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  openPath: (target: string): Promise<void> => ipcRenderer.invoke('shell:openPath', target),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  readClipboard: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  openLogs: (): Promise<void> => ipcRenderer.invoke('app:openLogs'),

  onEvent: (callback: (event: BackendEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: BackendEvent): void =>
      callback(payload)
    ipcRenderer.on('backend:event', listener)
    return () => ipcRenderer.removeListener('backend:event', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
