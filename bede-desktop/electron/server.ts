/**
 * Bede Local Server — stdio transport + HTTP bridge
 *
 * Architecture:
 *   Electron main ──stdin/stdout──▶ Python (main_stdio.py)
 *   Browser renderer  ──HTTP──▶ Node bridge (port 3741)  ──NDJSON──▶ Python
 *
 * The bridge also serves the bundled SPA static files so the renderer can use
 * the same origin for both the UI and API calls (relative /api/* paths work).
 */

import { ChildProcess, spawn } from 'child_process'
import * as fs from 'fs'
import * as http from 'http'
import * as path from 'path'

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error'

export interface BedeConfig {
  anthropic_api_key: string
  server_key: string
  secret_key: string
  site_url: string
  setup_complete: boolean
}

interface PendingRpc {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  streamWrite?: (chunk: string) => void
  streamEnd?: () => void
}

export class StdioServer {
  static readonly BRIDGE_PORT = 3741

  private proc: ChildProcess | null = null
  private httpServer: http.Server | null = null
  private _status: ServerStatus = 'stopped'
  private lastError = ''
  private pending = new Map<string, PendingRpc>()
  private counter = 0
  private lineBuf = ''
  private readyResolve?: () => void
  private readyReject?: (err: Error) => void
  private spaDist = ''
  private onStatusChange?: (s: ServerStatus, err?: string) => void

  setListener(fn: (s: ServerStatus, err?: string) => void) {
    this.onStatusChange = fn
  }

  private setStatus(s: ServerStatus, err?: string) {
    this._status = s
    this.lastError = err ?? ''
    this.onStatusChange?.(s, err)
  }

  getStatus(): { status: ServerStatus; error: string } {
    return { status: this._status, error: this.lastError }
  }

  async start(config: BedeConfig, resourcesPath: string): Promise<void> {
    if (this.proc) return
    this.setStatus('starting')

    const isDev = process.env.ELECTRON_DEV === '1'
    const devRoot = path.resolve(__dirname, '../..')

    // SPA static files: bundled in prod, built dist in dev
    this.spaDist = isDev
      ? path.join(devRoot, 'homeschool-tutor', 'dist')
      : path.join(resourcesPath, 'spa')

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ANTHROPIC_API_KEY: config.anthropic_api_key,
      SECRET_KEY:        config.secret_key,
      SERVER_KEY:        config.server_key,
      SITE_URL:          config.site_url || 'http://localhost',
      PRODUCTION:        'false',
    }

    if (isDev) {
      const apiDir = path.join(devRoot, 'homeschool-api')
      this.proc = spawn('python3', [path.join(apiDir, 'main_stdio.py')], {
        cwd: apiDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } else {
      const apiBin = path.join(resourcesPath, 'bede-api', 'bede-api')
      if (!fs.existsSync(apiBin)) {
        this.setStatus('error', 'bede-api binary not found in bundled resources')
        return
      }
      this.proc = spawn(apiBin, ['--stdio'], {
        cwd: path.dirname(apiBin),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }

    this.proc.on('error', (err) => this.setStatus('error', err.message))
    this.proc.on('exit', (code) => {
      this.proc = null
      this.httpServer?.close()
      this.httpServer = null
      if (code !== 0 && code !== null) {
        this.setStatus('error', `bede-api exited with code ${code}`)
      } else {
        this.setStatus('stopped')
      }
    })

    // Python stderr → process stderr (visible in Electron DevTools / logs)
    this.proc.stderr?.on('data', (d: Buffer) => process.stderr.write(d))

    // Python stdout → NDJSON dispatcher
    this.proc.stdout?.on('data', (d: Buffer) => this.onData(d))

    await this.waitReady(30)
    await this.startBridge()
    this.setStatus('running')
  }

  stop(): void {
    this.httpServer?.close()
    this.httpServer = null
    if (this.proc) {
      this.proc.kill('SIGTERM')
      this.proc = null
    }
    this.setStatus('stopped')
  }

  // ── NDJSON framing ──────────────────────────────────────────────────────────

  private nextId(): string {
    return `r${++this.counter}`
  }

  private sendToStdin(obj: object): void {
    this.proc?.stdin?.write(JSON.stringify(obj) + '\n')
  }

  private waitReady(timeoutSec: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('Python stdio server did not become ready in time')),
        timeoutSec * 1000,
      )
      this.readyResolve = () => { clearTimeout(t); resolve() }
      this.readyReject  = (err) => { clearTimeout(t); reject(err) }
    })
  }

  private onData(chunk: Buffer): void {
    this.lineBuf += chunk.toString('utf8')
    const lines = this.lineBuf.split('\n')
    this.lineBuf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        this.dispatch(JSON.parse(trimmed) as Record<string, unknown>)
      } catch {
        // ignore malformed lines
      }
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    const type = msg.type as string

    if (type === 'ready') {
      this.readyResolve?.()
      return
    }

    const id = msg.id as string | undefined
    if (!id) return
    const rpc = this.pending.get(id)
    if (!rpc) return

    switch (type) {
      case 'result':
        rpc.resolve(msg.data)
        this.pending.delete(id)
        break

      case 'error':
        rpc.reject(new Error(String(msg.message ?? 'Unknown error')))
        this.pending.delete(id)
        break

      case 'text':
      case 'tool':
      case 'assessment':
        rpc.streamWrite?.(
          `data: ${JSON.stringify({
            type,
            content: msg.content,
            ...(type === 'tool'       ? { tool: msg.tool }   : {}),
            ...(type === 'assessment' ? { data: msg.data }   : {}),
          })}\n\n`,
        )
        break

      case 'done':
        rpc.streamWrite?.(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        rpc.streamEnd?.()
        this.pending.delete(id)
        break
    }
  }

  // ── HTTP bridge ─────────────────────────────────────────────────────────────

  private startBridge(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => this.serveHttp(req, res))
      this.httpServer.listen(StdioServer.BRIDGE_PORT, '127.0.0.1', () => resolve())
      this.httpServer.once('error', reject)
    })
  }

  private serveHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const rawUrl = req.url ?? '/'
    const url    = rawUrl.split('?')[0]
    const method = req.method ?? 'GET'

    // Inline health — no Python round-trip needed
    if (url === '/health' || url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    // API calls → Python via stdin/stdout
    if (url.startsWith('/api/')) {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        let params: unknown = {}
        const body = Buffer.concat(chunks).toString('utf8')
        if (body) {
          try { params = JSON.parse(body) } catch { /* ignore */ }
        }

        // Strip /api prefix and extract path params
        const cleanUrl = url.slice(4)   // "/api/tutor/chat" → "/tutor/chat"
        const { rpcMethod, extraParams } = this.resolveRpc(method, cleanUrl)

        if (!rpcMethod) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ detail: 'Not found' }))
          return
        }

        const id = this.nextId()
        const mergedParams = { ...(params as object), ...extraParams }

        if (rpcMethod === 'tutor.chat') {
          // Streaming SSE response
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection:      'keep-alive',
          })
          this.pending.set(id, {
            resolve: () => {},
            reject:  () => {},
            streamWrite: (c) => { res.write(c) },
            streamEnd:   () => { res.end() },
          })
        } else {
          this.pending.set(id, {
            resolve: (data) => {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(data))
            },
            reject: (err) => {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ detail: err.message }))
            },
          })
        }

        this.sendToStdin({ id, method: rpcMethod, params: mergedParams })
      })
      return
    }

    // Everything else → serve SPA static files
    this.serveStatic(url, res)
  }

  private resolveRpc(
    httpMethod: string,
    url: string,   // already stripped of /api prefix
  ): { rpcMethod: string | null; extraParams: Record<string, string> } {
    const STATIC_MAP: Record<string, string> = {
      'POST /tutor/chat':    'tutor.chat',
      'POST /tutor/summary': 'tutor.summary',
      'GET /pod/configs':    'pod.list',
      'POST /pod/configs':   'pod.save',
      'GET /auth/validate':  'auth.validate',
    }
    const key = `${httpMethod} ${url}`
    if (STATIC_MAP[key]) {
      return { rpcMethod: STATIC_MAP[key], extraParams: {} }
    }

    // Dynamic routes with path segments
    const podConfigMatch = url.match(/^\/pod\/configs\/(.+)$/)
    if (podConfigMatch) {
      const name = decodeURIComponent(podConfigMatch[1])
      if (httpMethod === 'GET')    return { rpcMethod: 'pod.get',    extraParams: { name } }
      if (httpMethod === 'DELETE') return { rpcMethod: 'pod.delete', extraParams: { name } }
    }

    return { rpcMethod: null, extraParams: {} }
  }

  private serveStatic(url: string, res: http.ServerResponse): void {
    // Normalise: directory → index.html, strip leading slash
    const safeSuffix = (url === '/' ? '/index.html' : url).replace(/\.\./g, '')
    const filePath   = path.join(this.spaDist, safeSuffix)

    // SPA fallback: any unknown path → index.html (client-side routing)
    const servePath = fs.existsSync(filePath) ? filePath
                    : path.join(this.spaDist, 'index.html')

    if (!fs.existsSync(servePath)) {
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('SPA not built — run: cd homeschool-tutor && npm run build')
      return
    }

    const MIME: Record<string, string> = {
      html:  'text/html; charset=utf-8',
      js:    'application/javascript',
      css:   'text/css',
      png:   'image/png',
      svg:   'image/svg+xml',
      ico:   'image/x-icon',
      woff2: 'font/woff2',
      woff:  'font/woff',
      json:  'application/json',
    }
    const ext  = path.extname(servePath).slice(1).toLowerCase()
    const mime = MIME[ext] ?? 'application/octet-stream'

    try {
      const data = fs.readFileSync(servePath)
      res.writeHead(200, { 'Content-Type': mime })
      res.end(data)
    } catch {
      res.writeHead(500)
      res.end('Internal server error')
    }
  }
}
