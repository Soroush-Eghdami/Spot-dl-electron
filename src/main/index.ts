import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { is } from '@electron-toolkit/utils'
import { BackendBridge } from './backend'
import { loadSettings, saveSettings } from './settings'
import type {
  ApiResult,
  AppSettings,
  CompleteResult,
  DownloadOptions,
  EngineInfo,
  ResolveResult
} from '@shared/types'

let mainWindow: BrowserWindow | null = null
const bridge = new BackendBridge()

function iconPath(): string | undefined {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'icon.ico')]
    : [path.join(app.getAppPath(), 'build', 'icon.ico')]
  return candidates.find((candidate) => fs.existsSync(candidate))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 940,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#F8F6EE',
    title: 'SpotifyDL',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function fail(error: unknown): ApiResult<never> {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message }
}

function credentials(settings: AppSettings): {
  clientId: string
  clientSecret: string
  useOfficialApi: boolean
} {
  return {
    clientId: settings.spotifyClientId,
    clientSecret: settings.spotifyClientSecret,
    useOfficialApi: settings.useOfficialApi
  }
}

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  bridge.onEvent = (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backend:event', event)
    }
  }
  bridge.start()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  bridge.dispose()
})

ipcMain.handle('engine:ping', async (): Promise<ApiResult<EngineInfo>> => {
  try {
    const event = await bridge.request('ping', {}, ['result'], 90_000)
    return ok(event.data as EngineInfo)
  } catch (error) {
    return fail(error)
  }
})

ipcMain.handle('engine:resolve', async (_event, urls: string[]): Promise<ApiResult<ResolveResult>> => {
  try {
    const settings = loadSettings()
    const event = await bridge.request(
      'resolve',
      { urls, spotify: credentials(settings) },
      ['resolved'],
      15 * 60 * 1000
    )
    return ok({ collections: event.collections ?? [], songs: event.songs ?? [] })
  } catch (error) {
    return fail(error)
  }
})

ipcMain.handle(
  'engine:download',
  async (
    _event,
    urls: string[],
    options: DownloadOptions
  ): Promise<ApiResult<CompleteResult>> => {
    try {
      const settings = loadSettings()
      const event = await bridge.request(
        'download',
        { urls, options, spotify: credentials(settings) },
        ['complete'],
        12 * 60 * 60 * 1000
      )
      return ok({
        total: event.total ?? urls.length,
        ok: event.ok ?? 0,
        failed: event.failed ?? 0,
        skipped: event.skipped ?? 0,
        cancelled: Boolean(event.cancelled)
      })
    } catch (error) {
      return fail(error)
    }
  }
)

ipcMain.handle('engine:cancel', async (): Promise<ApiResult<null>> => {
  try {
    await bridge.cancel()
    return ok(null)
  } catch (error) {
    return fail(error)
  }
})

ipcMain.handle('settings:get', (): AppSettings => loadSettings())

ipcMain.handle('settings:set', (_event, patch: Partial<AppSettings>): AppSettings => {
  return saveSettings(patch)
})

ipcMain.handle('dialog:pickFolder', async (): Promise<string | null> => {
  const settings = loadSettings()
  const result = await dialog.showOpenDialog({
    defaultPath: settings.outputDir,
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('shell:openPath', async (_event, target: string): Promise<void> => {
  if (!target) return
  await shell.openPath(target)
})

ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<void> => {
  if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
})

ipcMain.handle('clipboard:read', async (): Promise<string> => clipboard.readText())

ipcMain.handle('app:version', (): string => app.getVersion())

ipcMain.handle('app:openLogs', async (): Promise<void> => {
  await shell.openPath(path.join(app.getPath('userData'), 'logs'))
})
