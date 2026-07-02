/**
 * 桌面代理跨平台共享工具函数
 *
 * 纯 Node.js / Electron 操作，无平台差异。
 * 从 win/executor.ts 提取，供 win 和 linux 两个适配器共用。
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { shell } from 'electron'

export const TEXT_READ_LIMIT = 512_000
export const LIST_LIMIT = 200
export const SEARCH_LIMIT = 100

export type ExecuteResult = {
  ok: boolean
  content: string
  summary: string
}

export function statLine(path: string): string {
  const st = statSync(path)
  const kind = st.isDirectory() ? '目录' : '文件'
  return `${kind} · ${st.size} 字节 · 修改于 ${st.mtime.toISOString()}`
}

export function listFolder(path: string): ExecuteResult {
  if (!existsSync(path)) {
    return { ok: false, content: '路径不存在', summary: `目录不存在：${path}` }
  }
  const entries = readdirSync(path, { withFileTypes: true })
    .slice(0, LIST_LIMIT)
    .map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)
  const suffix = entries.length >= LIST_LIMIT ? `\n…（仅显示前 ${LIST_LIMIT} 项）` : ''
  return {
    ok: true,
    content: entries.join('\n') + suffix,
    summary: `已列出 ${basename(path)}（${entries.length} 项）`
  }
}

export function readTextFile(path: string, maxBytes = TEXT_READ_LIMIT): ExecuteResult {
  if (!existsSync(path)) {
    return { ok: false, content: '文件不存在', summary: `读取失败：${path}` }
  }
  const st = statSync(path)
  if (st.isDirectory()) {
    return { ok: false, content: '路径是目录', summary: '无法以文本读取目录' }
  }
  const buf = readFileSync(path)
  const slice = buf.subarray(0, maxBytes)
  const truncated = buf.length > maxBytes
  const text = slice.toString('utf-8')
  return {
    ok: true,
    content: text + (truncated ? `\n…（仅显示前 ${maxBytes} 字节）` : ''),
    summary: `已读取 ${basename(path)}${truncated ? '（截断）' : ''}`
  }
}

export function searchFiles(root: string, query: string): ExecuteResult {
  if (!existsSync(root)) {
    return { ok: false, content: '路径不存在', summary: '搜索失败' }
  }
  const q = query.toLowerCase()
  const hits: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (hits.length >= SEARCH_LIMIT || depth > 6) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (hits.length >= SEARCH_LIMIT) break
      const full = join(dir, e.name)
      if (e.name.toLowerCase().includes(q)) hits.push(full)
      if (e.isDirectory()) walk(full, depth + 1)
    }
  }
  walk(root, 0)
  return {
    ok: true,
    content: hits.length ? hits.join('\n') : '（未找到匹配文件）',
    summary: `搜索「${query}」找到 ${hits.length} 项`
  }
}

export function grepText(root: string, query: string): ExecuteResult {
  const q = query.toLowerCase()
  const hits: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (hits.length >= 50 || depth > 3) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (hits.length >= 50) break
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      const ext = extname(e.name).toLowerCase()
      if (!['.txt', '.md', '.json', '.csv', '.log', '.js', '.ts', '.tsx', '.py'].includes(ext)) continue
      try {
        const text = readFileSync(full, 'utf-8').slice(0, 64_000)
        if (text.toLowerCase().includes(q)) hits.push(full)
      } catch {
        /* skip binary */
      }
    }
  }
  if (existsSync(root) && statSync(root).isFile()) {
    const one = readTextFile(root)
    if (one.ok && one.content.toLowerCase().includes(q)) hits.push(root)
  } else if (existsSync(root)) {
    walk(root, 0)
  }
  return {
    ok: true,
    content: hits.length ? hits.join('\n') : '（未找到包含该文本的文件）',
    summary: `grep「${query}」${hits.length} 个文件`
  }
}

export async function shellOpen(path: string): Promise<ExecuteResult> {
  const err = await shell.openPath(path)
  if (err) {
    return { ok: false, content: err, summary: `打开失败：${path}` }
  }
  return { ok: true, content: `已打开 ${path}`, summary: `已打开 ${basename(path)}` }
}

export async function downloadHttps(url: string, destPath: string): Promise<ExecuteResult> {
  if (!url.startsWith('https://')) {
    return { ok: false, content: '仅支持 HTTPS 下载', summary: '下载被拒绝' }
  }
  mkdirSync(dirname(destPath), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) {
    return { ok: false, content: `HTTP ${res.status}`, summary: '下载失败' }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 200 * 1024 * 1024) {
    return { ok: false, content: '文件超过 200MB 上限', summary: '下载被拒绝' }
  }
  writeFileSync(destPath, buf)
  return {
    ok: true,
    content: `已下载到 ${destPath}（${buf.length} 字节）`,
    summary: `已下载 ${basename(destPath)}`
  }
}

export function defaultDownloadDir(settingsDir?: string): string {
  if (settingsDir?.trim()) return settingsDir.trim()
  return join(homedir(), 'Downloads', 'AckemDownloads')
}
