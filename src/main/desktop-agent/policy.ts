import { homedir } from 'node:os'
import { env } from 'node:process'
import { isAbsolute, normalize, resolve } from 'node:path'
import { PLATFORM } from '../../shared/platform'
import type { DesktopAgentAction } from '../../shared/desktopAgent'
import {
  APP_ACTIONS,
  DOCUMENT_READ_ACTIONS,
  DOWNLOAD_ACTIONS,
  WRITE_ACTIONS
} from './actions'
import type { AppSettings } from '../settings'

const BLOCKED_PROCESS_NAMES_WIN = new Set([
  'csrss.exe',
  'winlogon.exe',
  'lsass.exe',
  'services.exe',
  'smss.exe',
  'system',
  'registry',
  'explorer.exe'
])

const BLOCKED_PROCESS_NAMES_LINUX = new Set([
  'systemd',
  'init',
  'gnome-shell',
  'plasmashell',
  'kwin_x11',
  'Xorg',
  'Xwayland',
  'dbus-daemon',
  'pulseaudio',
  'pipewire',
  'pipewire-pulse',
])

const SYSTEM_WRITE_PREFIXES_WIN = [
  'c:\\windows\\system32',
  'c:\\windows\\syswow64'
]

const SYSTEM_WRITE_PREFIXES_LINUX = [
  '/boot',
  '/etc',
  '/sys',
  '/proc',
  '/usr/lib/systemd',
  '/usr/lib/modules',
]

const BLOCKED_PROCESS_NAMES = PLATFORM === 'linux' ? BLOCKED_PROCESS_NAMES_LINUX : BLOCKED_PROCESS_NAMES_WIN
const SYSTEM_WRITE_PREFIXES = PLATFORM === 'linux' ? SYSTEM_WRITE_PREFIXES_LINUX : SYSTEM_WRITE_PREFIXES_WIN

export type PolicyCheck = {
  ok: boolean
  normalizedPath?: string
  normalizedPathTo?: string
  sensitiveWarning?: string
  pathMissing?: boolean
  hardBlockReason?: string
  settingsBlockReason?: string
}

function expandPathTokens(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^~(?=$|[\\/])/g, homedir())
  if (PLATFORM === 'linux') {
    // 支持 $VAR 和 ${VAR} 环境变量展开
    s = s.replace(/\$\{([^}]+)\}/g, (_, name: string) => env[name] ?? `\${${name}}`)
    s = s.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name: string) => env[name] ?? `$${name}`)
  }
  s = s.replace(/%([^%]+)%/g, (_, name: string) => {
    const key = name in env ? name : name.toUpperCase()
    return env[key] ?? `%${name}%`
  })
  return s
}

function normalizeUserPath(raw: string, cwd: string): string {
  const trimmed = expandPathTokens(raw)
  if (!trimmed) return ''
  const abs = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed)
  const norm = normalize(abs)
  if (norm.includes('..')) {
    throw new Error('路径不能包含 .. 逃逸')
  }
  return norm
}

function isSensitivePath(path: string): boolean {
  if (PLATFORM === 'linux') {
    if (path.startsWith('/etc')) return true
    if (path.startsWith('/boot')) return true
    if (path.startsWith('/sys')) return true
    if (path.startsWith('/proc')) return true
    if (path.startsWith('/root')) return true
    if (path.startsWith('/var/lib')) return true
    return false
  }
  const lower = path.toLowerCase()
  if (lower.startsWith('c:\\windows')) return true
  if (lower.startsWith('c:\\program files')) return true
  if (lower.startsWith('c:\\program files (x86)')) return true
  return false
}

function isHardBlockedWritePath(path: string): boolean {
  const lower = path.toLowerCase()
  return SYSTEM_WRITE_PREFIXES.some((p) => lower.startsWith(p))
}

export function isBlockedCloseTarget(target: string): boolean {
  const name = target.trim().toLowerCase()
  if (!name) return false
  if (PLATFORM === 'linux') {
    // Linux 进程名不含 .exe，直接匹配
    if (BLOCKED_PROCESS_NAMES.has(name)) return true
    // 也检查去掉路径前缀的基本名称
    const base = name.includes('/') ? name.split('/').pop() ?? name : name
    return BLOCKED_PROCESS_NAMES.has(base)
  }
  const base = name.endsWith('.exe') ? name : `${name}.exe`
  return BLOCKED_PROCESS_NAMES.has(base) || BLOCKED_PROCESS_NAMES.has(name)
}

export function checkActionSettings(
  action: DesktopAgentAction,
  settings: AppSettings
): string | null {
  if (APP_ACTIONS.has(action) && !settings.desktopAgentAllowAppControl) {
    return '设置中未允许打开/关闭应用程序'
  }
  if (WRITE_ACTIONS.has(action)) {
    if (!settings.desktopAgentAllowFileWrite) {
      return '设置中未允许复制、移动、写入或删除文件'
    }
    if (action === 'delete_path' && !settings.desktopAgentAllowDelete) {
      return '设置中未允许删除文件'
    }
  }
  if (DOWNLOAD_ACTIONS.has(action)) {
    if (!settings.desktopAgentAllowDownload) {
      return '设置中未允许从网络下载'
    }
    if (
      (action === 'download_and_install' || action === 'run_installer') &&
      !settings.desktopAgentAllowInstall
    ) {
      return '设置中未允许运行安装包'
    }
  }
  if (DOCUMENT_READ_ACTIONS.has(action) && !settings.desktopAgentAllowDocumentRead) {
    return '设置中未允许读取文档或图片内容'
  }
  return null
}

export function evaluatePathPolicy(
  action: DesktopAgentAction,
  path: string | undefined,
  pathTo: string | undefined,
  cwd: string
): PolicyCheck {
  const needsPath = !['open_app', 'close_app', 'focus_app', 'download_file', 'download_and_install'].includes(
    action
  )
  const needsTargetOnly = ['open_app', 'close_app', 'focus_app'].includes(action)

  if (needsTargetOnly) {
    return { ok: true }
  }

  if (needsPath && !path?.trim()) {
    return { ok: false, hardBlockReason: '缺少 path 参数' }
  }

  let normalizedPath: string | undefined
  let normalizedPathTo: string | undefined
  let pathMissing = false

  if (path?.trim()) {
    try {
      normalizedPath = normalizeUserPath(path, cwd)
    } catch (e) {
      return {
        ok: false,
        hardBlockReason: e instanceof Error ? e.message : String(e)
      }
    }
  }

  if (pathTo?.trim()) {
    try {
      normalizedPathTo = normalizeUserPath(pathTo, cwd)
    } catch (e) {
      return {
        ok: false,
        hardBlockReason: e instanceof Error ? e.message : String(e)
      }
    }
  }

  if (
    normalizedPath &&
    WRITE_ACTIONS.has(action) &&
    isHardBlockedWritePath(normalizedPath)
  ) {
    return {
      ok: false,
      normalizedPath,
      hardBlockReason: '系统关键路径禁止写入或删除'
    }
  }

  if (
    normalizedPathTo &&
    WRITE_ACTIONS.has(action) &&
    isHardBlockedWritePath(normalizedPathTo)
  ) {
    return {
      ok: false,
      normalizedPath,
      normalizedPathTo,
      hardBlockReason: '目标位于系统关键路径，禁止操作'
    }
  }

  const sensitive =
    (normalizedPath && isSensitivePath(normalizedPath)) ||
    (normalizedPathTo && isSensitivePath(normalizedPathTo))

  return {
    ok: true,
    normalizedPath,
    normalizedPathTo,
    pathMissing,
    sensitiveWarning: sensitive ? '这是系统或敏感路径，请谨慎允许' : undefined
  }
}
