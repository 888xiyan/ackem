import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import { PLATFORM, LAUNCHER_BINARY_NAME } from '../../shared/platform'

/** 更新前检查环境是否就绪，返回安装目录 */
export function runUpdatePreflight(): { ok: boolean; reason?: string; installDir: string } {
  const exePath = app.getPath('exe')
  const installDir = dirname(exePath)

  if (PLATFORM === 'linux') {
    // AppImage 挂载点不支持原地更新（只读文件系统）
    if (exePath.includes('/tmp/.mount_')) {
      return { ok: false, reason: 'AppImage 不支持原地更新，请下载新版本替换', installDir }
    }
    // 系统级安装（/usr/bin, /opt 等）需要权限
    if (installDir.startsWith('/usr/') || installDir.startsWith('/opt/')) {
      return { ok: false, reason: '系统目录需要管理员权限才能更新', installDir }
    }
  }

  return { ok: true, installDir }
}

export function resolveLauncherExePath(installDir: string): string {
  if (PLATFORM === 'linux') {
    const l = join(installDir, LAUNCHER_BINARY_NAME)
    if (existsSync(l)) return l
    return app.getPath('exe')
  }
  const launcher = join(installDir, 'AckemLauncher.exe')
  if (existsSync(launcher)) return launcher
  const cmd = join(installDir, 'AckemLauncher.cmd')
  if (existsSync(cmd)) return cmd
  // 兼容旧绿色版
  const legacy = join(installDir, 'AckemUpdater.exe')
  if (existsSync(legacy)) return legacy
  return app.getPath('exe')
}

/** @deprecated use resolveLauncherExePath */
export function resolveUpdaterExePath(installDir: string): string {
  return resolveLauncherExePath(installDir)
}

export function spawnLauncherProcess(installDir: string, jobPath: string): void {
  const target = resolveLauncherExePath(installDir)
  const arg = `--ackem-updater=${jobPath}`

  if (PLATFORM === 'linux') {
    const child = spawn(target, [arg], {
      detached: true,
      stdio: 'ignore',
      cwd: installDir
    })
    child.unref()
    return
  }

  if (target.toLowerCase().endsWith('.cmd')) {
    const child = spawn('cmd.exe', ['/c', target, arg], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: installDir
    })
    child.unref()
    return
  }

  const child = spawn(target, [arg], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    cwd: installDir
  })
  child.unref()
}
