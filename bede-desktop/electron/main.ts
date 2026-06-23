import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { ApiServer, BedeConfig } from './server'

const isDev  = process.env.ELECTRON_DEV === '1'
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const DEFAULT_CONFIG: BedeConfig = {
  anthropic_api_key: '',
  parent_password:   '',
  child_pin:         '',
  secret_key:        randomHex(32),
  master_secret:     randomHex(32),
  setup_complete:    false,
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readConfig(): BedeConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function writeConfig(cfg: BedeConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8')
}

const server = new ApiServer()
let win: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 820,
    height: 620,
    minWidth: 680,
    minHeight: 540,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0e1828',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5174')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('closed', () => { win = null })
}

function buildTrayMenu() {
  const { status } = server.getStatus()
  return Menu.buildFromTemplate([
    { label: 'Open Bede', click: () => { if (win) win.show(); else createWindow() } },
    { type: 'separator' },
    {
      label: status === 'running' ? 'Server: Running' : 'Server: Stopped',
      enabled: false,
    },
    {
      label: status === 'running' ? 'Stop Server' : 'Start Server',
      click: async () => {
        if (status === 'running') {
          server.stop()
        } else {
          const cfg = readConfig()
          await server.start(cfg, app.getPath('exe').replace(/\/[^/]+$/, '/../Resources'))
        }
        tray?.setContextMenu(buildTrayMenu())
      },
    },
    { type: 'separator' },
    { label: 'Quit Bede', click: () => app.quit() },
  ])
}

app.whenReady().then(() => {
  createWindow()

  // Tray
  const iconPath = path.join(
    isDev ? path.join(__dirname, '../build') : path.join(__dirname, '..'),
    'tray-icon.png'
  )
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('Bede Tutor')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => { if (win) win.show(); else createWindow() })

  // Refresh tray on status change and forward to renderer
  server.setListener((status, error) => {
    tray?.setContextMenu(buildTrayMenu())
    win?.webContents.send('bede:status', status, error ?? '')
  })

  // IPC handlers
  ipcMain.handle('bede:get-config', () => readConfig())
  ipcMain.handle('bede:save-config', (_, cfg: BedeConfig) => { writeConfig(cfg); return true })
  ipcMain.handle('bede:server-status', () => server.getStatus())
  ipcMain.handle('bede:server-start', async () => {
    const cfg = readConfig()
    const resources = app.isPackaged
      ? path.join(process.resourcesPath)
      : path.join(__dirname, '..')
    await server.start(cfg, resources)
    return server.getStatus()
  })
  ipcMain.handle('bede:server-stop', () => { server.stop(); return true })
  ipcMain.handle('bede:open-browser', () => shell.openExternal('http://localhost:8000'))

  app.on('activate', () => { if (!win) createWindow() })
})

app.on('window-all-closed', () => {
  // Keep alive as tray app on Mac; quit on Windows/Linux
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => server.stop())
