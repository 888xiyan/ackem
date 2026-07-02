/**
 * electron-builder portable 会设置 PORTABLE_EXECUTABLE_* 环境变量（仅 Windows）。
 * 数据目录、桌面快捷方式必须指向「便携 exe 所在目录」，而非 TEMP 内解压的 Ackem.exe。
 * Linux 上无 portable wrapper 概念，直接使用 app.getPath('exe')。
 */
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IS_LINUX } from '../shared/platform'

export function isPortableWrapperLaunch(): boolean {
  if (IS_LINUX) return false
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE?.trim())
}

/** 用户放置的便携 exe 所在目录（或普通安装/解压目录） */
export function resolvePackagedAppDir(): string {
  if (!IS_LINUX) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
    if (portableDir && existsSync(portableDir)) return portableDir
  }
  return dirname(app.getPath('exe'))
}

/** 用户应双击启动的路径：便携 wrapper exe，或 Ackem.exe / ackem */
export function resolveUserLaunchPath(): string {
  if (IS_LINUX) return app.getPath('exe')
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE?.trim()
  if (portableFile && existsSync(portableFile)) return portableFile
  return app.getPath('exe')
}

/** 快捷方式 / 卸载用的图标路径（Windows .ico，Linux .png） */
export function resolveShortcutIconPath(): string | undefined {
  if (IS_LINUX) {
    const roots = [
      join(process.resourcesPath, 'resources', 'icon.png'),
      join(process.resourcesPath, 'icon.png'),
      join(resolvePackagedAppDir(), 'resources', 'resources', 'icon.png'),
      join(resolvePackagedAppDir(), 'resources', 'icon.png'),
    ]
    for (const p of roots) {
      if (existsSync(p)) return p
    }
    return undefined
  }
  const roots = [
    join(process.resourcesPath, 'resources', 'icon.ico'),
    join(process.resourcesPath, 'icon.ico'),
    join(resolvePackagedAppDir(), 'resources', 'resources', 'icon.ico'),
    join(resolvePackagedAppDir(), 'resources', 'icon.ico'),
  ]
  for (const p of roots) {
    if (existsSync(p)) return p
  }
  return undefined
}
