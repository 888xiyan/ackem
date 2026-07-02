/**
 * Ackem 卸载：桌面快捷方式、可选删除数据/程序；支持设置内触发或运行 uninstall 脚本
 */
import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { PLATFORM } from '../../shared/platform'
import { loadSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import { createLogger } from '../logger'
import { markAppQuitting, performAppShutdown } from '../shutdown'
import { resolvePackagedAppDir } from '../portableEnv'

const log = createLogger('uninstall')

export type UninstallMode = 'dev' | 'portable' | 'installed'

export type UninstallInfo = {
  mode: UninstallMode
  installDir: string
  dataRoot: string
  scriptPath: string | null
  nsisUninstaller: string | null
}

export type UninstallLaunchOptions = {
  deleteData?: boolean
  removeApp?: boolean
}

function exeDir(): string {
  return resolvePackagedAppDir()
}

function resolveNsisUninstaller(installDir: string): string | null {
  if (PLATFORM !== 'win32') return null
  const candidates = [
    join(installDir, 'Uninstall Ackem.exe'),
    join(installDir, 'Uninstall.exe')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function resolveUninstallScriptPath(): string | null {
  const scriptName = PLATFORM === 'linux' ? 'uninstall.sh' : 'Uninstall Ackem.bat'
  const candidates = PLATFORM === 'linux'
    ? [
        join(exeDir(), 'uninstall.sh'),
        join(process.resourcesPath, 'uninstall.sh'),
        join(exeDir(), 'resources', 'uninstall.sh'),
      ]
    : [
        join(exeDir(), 'Uninstall Ackem.bat'),
        join(process.resourcesPath, 'uninstall.bat'),
        join(exeDir(), 'resources', 'uninstall.bat'),
      ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  if (!app.isPackaged) {
    const devScript = PLATFORM === 'linux' ? 'uninstall.sh' : 'uninstall.bat'
    const dev = join(process.cwd(), 'scripts', devScript)
    if (existsSync(dev)) return dev
  }
  return null
}

export function getUninstallInfo(): UninstallInfo {
  const installDir = exeDir()
  const dataRoot = resolveDataRoot(loadSettings())
  const nsisUninstaller = resolveNsisUninstaller(installDir)
  let mode: UninstallMode = 'dev'
  if (app.isPackaged) {
    mode = nsisUninstaller ? 'installed' : 'portable'
  }
  return {
    mode,
    installDir,
    dataRoot,
    scriptPath: resolveUninstallScriptPath(),
    nsisUninstaller
  }
}

function spawnDetachedUninstall(scriptPath: string, args: string[]): void {
  if (PLATFORM === 'linux') {
    const child = spawn('bash', [scriptPath, ...args], {
      detached: true,
      stdio: 'ignore',
      cwd: dirname(scriptPath)
    })
    child.unref()
  } else {
    const child = spawn('cmd.exe', ['/c', scriptPath, ...args], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: dirname(scriptPath)
    })
    child.unref()
  }
}

export async function launchUninstallAndQuit(opts: UninstallLaunchOptions): Promise<void> {
  markAppQuitting()
  await performAppShutdown()

  const info = getUninstallInfo()
  const deleteData = Boolean(opts.deleteData)
  const removeApp = Boolean(opts.removeApp)

  if (info.nsisUninstaller && !removeApp && !deleteData) {
    shell.openPath(info.nsisUninstaller)
    app.quit()
    return
  }

  const script = info.scriptPath
  if (!script) {
    log.warn('uninstall script not found', info)
    if (deleteData && existsSync(info.dataRoot)) {
      shell.trashItem(info.dataRoot).catch(() => {})
    }
    app.quit()
    return
  }

  const args: string[] = []
  if (deleteData) args.push('--delete-data')
  if (removeApp || info.mode === 'portable') args.push('--remove-app')

  log.info('launching uninstall helper', { script, args })
  spawnDetachedUninstall(script, args)
  app.quit()
}
