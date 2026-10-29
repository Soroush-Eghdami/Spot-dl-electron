import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import type { BackendEvent } from '@shared/types'

interface Pending {
  resolve: (event: BackendEvent) => void
  reject: (error: Error) => void
  terminal: string[]
  timer: NodeJS.Timeout
}

interface BackendCommand {
  command: string
  args: string[]
}

const isWindows = process.platform === 'win32'

function backendCommand(): BackendCommand {
  const override = process.env.SPOTIFYDL_BACKEND
  if (override && fs.existsSync(override)) {
    return { command: override, args: [] }
  }

  const exeName = isWindows ? 'spotdl-backend.exe' : 'spotdl-backend'
  if (app.isPackaged) {
    return { command: path.join(process.resourcesPath, 'backend', exeName), args: [] }
  }

  const appPath = app.getAppPath()
  const built = path.join(appPath, 'backend', 'dist', 'spotdl-backend', exeName)
  if (fs.existsSync(built) && process.env.SPOTIFYDL_DEV_PYTHON !== '1') {
    return { command: built, args: [] }
  }

  const venvPython = path.join(
    appPath,
    'venv',
    isWindows ? 'Scripts' : 'bin',
    isWindows ? 'python.exe' : 'python'
  )
  const python = fs.existsSync(venvPython) ? venvPython : isWindows ? 'python' : 'python3'
  return { command: python, args: ['-u', path.join(appPath, 'backend', 'spotdl_backend.py')] }
}

export class BackendBridge {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<string, Pending>()
  private sequence = 0
  private logStream: fs.WriteStream | null = null
  private disposed = false
  private starting = false

  onEvent: ((event: BackendEvent) => void) | null = null

  constructor() {
    this.openLog()
  }

  get running(): boolean {
    return this.child !== null && !this.child.killed
  }

  get command(): BackendCommand {
    return backendCommand()
  }

  private openLog(): void {
    try {
      const dir = path.join(app.getPath('userData'), 'logs')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'backend.log')
      if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1024 * 1024) {
        fs.renameSync(file, path.join(dir, 'backend.old.log'))
      }
      this.logStream = fs.createWriteStream(file, { flags: 'a' })
      this.logStream.write(`\n===== ${new Date().toISOString()} =====\n`)
    } catch {
      this.logStream = null
    }
  }

  private log(line: string): void {
    if (this.logStream && line.trim()) this.logStream.write(line + '\n')
  }

  start(): void {
    if (this.disposed || this.running || this.starting) return
    this.starting = true
    const { command, args } = backendCommand()
    this.log(`[spawn] ${command} ${args.join(' ')}`)

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(command, args, {
        windowsHide: true,
        cwd: path.dirname(command),
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (error) {
      this.starting = false
      this.failAll(new Error(`Could not start the download engine: ${String(error)}`))
      this.onEvent?.({ event: 'engine-exit', message: String(error) })
      return
    }

    this.child = child
    this.starting = false

    const stdout = readline.createInterface({ input: child.stdout })
    stdout.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('{')) {
        if (trimmed) this.log(`[stdout] ${trimmed}`)
        return
      }
      let message: BackendEvent
      try {
        message = JSON.parse(trimmed) as BackendEvent
      } catch {
        this.log(`[bad-json] ${trimmed.slice(0, 500)}`)
        return
      }
      this.handle(message)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      this.log(chunk.toString())
    })

    child.on('error', (error) => {
      this.log(`[error] ${error.message}`)
    })

    child.on('exit', (code, signal) => {
      this.log(`[exit] code=${code} signal=${signal}`)
      if (this.child === child) this.child = null
      stdout.close()
      this.failAll(new Error('The download engine stopped unexpectedly. It will restart on the next action.'))
      this.onEvent?.({ event: 'engine-exit', message: 'The download engine stopped.' })
    })
  }

  private handle(message: BackendEvent): void {
    if (message.event === 'ready') {
      this.log('[ready]')
    }

    this.onEvent?.(message)

    if (!message.id) return
    const pending = this.pending.get(message.id)
    if (!pending) return

    if (message.event === 'error') {
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      pending.reject(new Error(message.message || 'The engine reported an error.'))
      return
    }

    if (pending.terminal.includes(message.event)) {
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      pending.resolve(message)
    }
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  request(
    command: string,
    payload: Record<string, unknown> = {},
    terminal: string[] = ['result'],
    timeoutMs = 10 * 60 * 1000
  ): Promise<BackendEvent> {
    this.start()
    if (!this.child) {
      return Promise.reject(new Error('The download engine is not available.'))
    }

    const id = `req-${++this.sequence}`
    return new Promise<BackendEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('The engine took too long to respond.'))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, terminal, timer })

      try {
        this.child?.stdin.write(`${JSON.stringify({ id, cmd: command, ...payload })}\n`)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new Error(`Could not talk to the download engine: ${String(error)}`))
      }
    })
  }

  async cancel(): Promise<void> {
    if (!this.running) return
    try {
      await this.request('cancel', {}, ['result'], 15000)
    } catch {
      // Best effort: the worker checks its own cancel flag anyway.
    }
  }

  dispose(): void {
    this.disposed = true
    const child = this.child
    this.child = null
    this.failAll(new Error('The app is closing.'))
    if (child) {
      try {
        child.stdin.write(`${JSON.stringify({ id: 'shutdown', cmd: 'shutdown' })}\n`)
      } catch {
        // Child already gone.
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill()
        } catch {
          // Nothing left to kill.
        }
      }, 800)
    }
    this.logStream?.end()
  }
}
