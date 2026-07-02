/**
 * Linux .desktop 文件解析器
 *
 * 扫描标准目录中的 .desktop 文件，提取 Name / Exec / Icon / Categories 等信息。
 * .desktop 文件格式为 INI-like，无需外部库。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

export type DesktopEntry = {
  /** 文件路径 */
  filePath: string
  /** 应用名称 */
  name: string
  /** 执行命令 */
  exec: string
  /** 图标名或路径 */
  icon: string
  /** 应用分类 */
  categories: string[]
  /** 是否在菜单中显示（NoDisplay=true 则不显示） */
  noDisplay: boolean
  /** 终端运行 */
  terminal: boolean
  /** 启动通知 */
  startupNotify: boolean
}

const SCAN_DIRS = [
  '/usr/share/applications',
  '/usr/local/share/applications',
  join(homedir(), '.local/share/applications'),
  '/var/lib/snapd/desktop/applications',
  join(homedir(), '.local/share/flatpak/exports/share/applications'),
]

/** 解析 INI 格式的单行键值 */
function parseDesktopFile(filePath: string): DesktopEntry | null {
  try {
    const text = readFileSync(filePath, 'utf-8')
    const entry: DesktopEntry = {
      filePath,
      name: '',
      exec: '',
      icon: '',
      categories: [],
      noDisplay: false,
      terminal: false,
      startupNotify: false,
    }

    let inDesktopEntry = false
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim()
      if (!inDesktopEntry) {
        if (line === '[Desktop Entry]') inDesktopEntry = true
        continue
      }
      if (line.startsWith('[')) break // 下一个 section 停止解析

      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) continue
      const key = line.slice(0, eqIdx).trim()
      // 优先用无语言的 Name，否则用 Name=xx
      if (key === 'Name') {
        entry.name = line.slice(eqIdx + 1).trim()
      } else if (key === 'Exec') {
        entry.exec = line.slice(eqIdx + 1).trim()
      } else if (key === 'Icon') {
        entry.icon = line.slice(eqIdx + 1).trim()
      } else if (key === 'Categories') {
        entry.categories = line.slice(eqIdx + 1).split(';').filter(Boolean)
      } else if (key === 'NoDisplay') {
        entry.noDisplay = line.slice(eqIdx + 1).trim() === 'true'
      } else if (key === 'Terminal') {
        entry.terminal = line.slice(eqIdx + 1).trim() === 'true'
      } else if (key === 'StartupNotify') {
        entry.startupNotify = line.slice(eqIdx + 1).trim() === 'true'
      }
    }

    if (!entry.name) return null
    return entry
  } catch {
    return null
  }
}

/** 扫描所有标准目录中的 .desktop 文件 */
export function scanDesktopEntries(): DesktopEntry[] {
  const results: DesktopEntry[] = []
  const seen = new Set<string>()

  for (const dir of SCAN_DIRS) {
    if (!existsSync(dir)) continue
    try {
      const files = readdirSync(dir)
      for (const file of files) {
        if (!file.endsWith('.desktop')) continue
        if (seen.has(file)) continue // 用户目录优先级高，同名只取第一个
        seen.add(file)
        const fullPath = join(dir, file)
        const entry = parseDesktopFile(fullPath)
        if (entry) results.push(entry)
      }
    } catch {
      // 权限不足时跳过
    }
  }

  return results
}

/** 根据名称搜索 desktop entry */
export function searchDesktopEntries(query: string): DesktopEntry[] {
  const q = query.toLowerCase()
  return scanDesktopEntries().filter(
    (e) => e.name.toLowerCase().includes(q) || e.categories.some((c) => c.toLowerCase().includes(q))
  )
}
