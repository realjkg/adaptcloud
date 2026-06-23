import { ChildProcess, spawn } from 'child_process'
import * as path from 'path'
import * as http from 'http'
import * as fs from 'fs'

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface BedeConfig {
  anthropic_api_key: string
  parent_password: string
  child_pin: string
  secret_key: string
  master_secret: string
  setup_complete: boolean
}

export class ApiServer {
  private proc: ChildProcess | null = null
  private status: ServerStatus = 'stopped'
  private lastError = ''
  private onStatusChange?: (s: ServerStatus, err?: string) => void

  setListener(fn: (s: ServerStatus, err?: string) => void) {
    this.onStatusChange = fn
  }

  private emit(s: ServerStatus, err?: string) {
    this.status = s
    this.lastError = err ?? ''
    this.onStatusChange?.(s, err)
  }

  getStatus(): { status: ServerStatus; error: string } {
    return { status: this.status, error: this.lastError }
  }

  async start(config: BedeConfig, resourcesPath: string): Promise<void> {
    if (this.proc) return

    this.emit('starting')

    // Locate the bede-api binary (bundled) or fall back to uvicorn (dev)
    const apiBinary = path.join(resourcesPath, 'bede-api', 'bede-api')
    const apiDir    = path.join(resourcesPath, 'api')
    const isDev     = process.env.ELECTRON_DEV === '1'

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANTHROPIC_API_KEY: config.anthropic_api_key,
      PARENT_PASSWORD:   config.parent_password,
      CHILD_PIN:         config.child_pin,
      SECRET_KEY:        config.secret_key,
      MASTER_SECRET:     config.master_secret,
      CORS_ORIGINS:      'http://localhost:5174,http://localhost:3000',
      PORT:              '8000',
    }

    if (isDev) {
      // Dev: run uvicorn directly from homeschool-api/
      const devApiPath = path.resolve(__dirname, '../../homeschool-api')
      this.proc = spawn('uvicorn', ['main:app', '--port', '8000', '--reload'], {
        cwd: devApiPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else if (fs.existsSync(apiBinary)) {
      // Prod: bundled PyInstaller binary
      this.proc = spawn(apiBinary, [], {
        cwd: apiDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } else {
      this.emit('error', 'bede-api binary not found in bundled resources')
      return
    }

    this.proc.on('error', (err) => this.emit('error', err.message))
    this.proc.on('exit', (code) => {
      this.proc = null
      if (code !== 0 && code !== null) {
        this.emit('error', `bede-api exited with code ${code}`)
      } else {
        this.emit('stopped')
      }
    })

    // Poll health until ready (30 s timeout)
    await this.waitForHealth(30)
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
    this.emit('stopped')
  }

  private waitForHealth(timeoutSec: number): Promise<void> {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutSec * 1000
      const poll = () => {
        if (Date.now() > deadline) {
          this.emit('error', 'API server did not become ready in time')
          return resolve()
        }
        http.get('http://localhost:8000/api/health', (res) => {
          if (res.statusCode === 200) {
            this.emit('running')
            return resolve()
          }
          setTimeout(poll, 500)
        }).on('error', () => setTimeout(poll, 500))
      }
      setTimeout(poll, 800)
    })
  }
}
