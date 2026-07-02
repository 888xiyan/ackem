/**
 * Linux 桌面代理执行器
 *
 * 实现 Linux 平台特有的进程执行逻辑（closeAppTarget / openAppTarget），
 * 其他文件操作（listFolder / readTextFile / searchFiles / grepText / downloadHttps）
 * 由 adapters/common.ts 提供跨平台复用。
 */
import { spawn } from 'node:child_process'
import {
  basename,
  dirname,
  join
} from 'node:path'
import { isBlockedCloseTarget } from '../../policy'
import type { DesktopAgentAction, UseComputerArgs } from '../../../../shared/desktopAgent'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { shell } from 'electron'
import {
  defaultDownloadDir,
  downloadHttps,
  ExecuteResult,
  grepText,
  listFolder,
  readTextFile,
  searchFiles,
  shellOpen,
  statLine
} from '../common'

/** 运行 bash 脚本，返回执行结果 */
function runBash(script: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', script])
    let out = ''
    child.stdout.on('data', (d) => { out += String(d) })
    child.stderr.on('data', (d) => { out += String(d) })
    child.on('close', (code) => resolve({ ok: code === 0, output: out.trim() }))
    child.on('error', (e) => resolve({ ok: false, output: e.message }))
  })
}

async function closeAppTarget(target: string): Promise<ExecuteResult> {
  if (isBlockedCloseTarget(target)) {
    return { ok: false, content: '系统关键进程不可关闭', summary: '关闭被拒绝' }
  }
  const escaped = target.replace(/'/g, "'\\''")
  const result = await runBash(`pkill -f '${escaped}' 2>/dev/null; echo $?`)
  const ok = result.output?.trim() === '0'
  return {
    ok,
    content: ok ? `已终止 ${target}` : (result.output || '未找到进程'),
    summary: ok ? `已关闭 ${target}` : `未能关闭 ${target}`
  }
}

async function openAppTarget(target: string): Promise<ExecuteResult> {
  // 先尝试直接执行（如果目标有执行权限），否则用 xdg-open
  const escaped = target.replace(/'/g, "'\\''")
  const result = await runBash(
    `if [ -x '${escaped}' ]; then '${escaped}' & disown; echo OK; else xdg-open '${escaped}' 2>/dev/null & disown; echo OK; fi`
  )
  return { ok: true, content: `已启动 ${target}`, summary: `已打开 ${target}` }
}

export async function executeDesktopAgentAction(
  action: DesktopAgentAction,
  args: UseComputerArgs,
  ctx: { dataRoot: string; downloadDir?: string; cwd: string }
): Promise<ExecuteResult> {
  const path = args.path ?? ''
  const pathTo = args.path_to ?? ''
  const target = args.target ?? ''
  const query = args.query ?? ''
  const url = args.url ?? ''

  switch (action) {
    case 'list_folder':
      return listFolder(path)
    case 'stat_file':
      if (!existsSync(path)) {
        return { ok: false, content: '路径不存在', summary: `stat 失败：${path}` }
      }
      return { ok: true, content: statLine(path), summary: `已查看 ${basename(path)} 信息` }
    case 'read_text':
      return readTextFile(path)
    case 'read_document': {
      const ext = basename(path).includes('.') ? `.${basename(path).split('.').pop()}`.toLowerCase() : ''
      if (['.txt', '.md', '.csv', '.json', '.log'].includes(ext)) {
        return readTextFile(path)
      }
      return {
        ok: false,
        content:
          'V1 暂不支持解析该文档格式全文；若为纯文本可改用 read_text，或先将文件导入 Ackem。',
        summary: `文档格式 ${ext || '未知'} 暂未解析`
      }
    }
    case 'read_image':
      return {
        ok: true,
        content: existsSync(path) ? statLine(path) : '文件不存在',
        summary: existsSync(path) ? `已定位图片 ${basename(path)}（OCR/Vision 后续版本）` : '图片不存在'
      }
    case 'search_files':
      return searchFiles(path || ctx.cwd, query || basename(path))
    case 'grep_text':
      return grepText(path || ctx.cwd, query || '')
    case 'open_folder':
    case 'open_file':
      return shellOpen(path)
    case 'open_app':
      return openAppTarget(target || path)
    case 'focus_app':
      return openAppTarget(target || path)
    case 'close_app':
      return closeAppTarget(target || basename(path))
    case 'close_file':
      return closeAppTarget(target || basename(path))
    case 'copy_path':
      mkdirSync(dirname(pathTo), { recursive: true })
      copyFileSync(path, pathTo)
      return { ok: true, content: `已复制到 ${pathTo}`, summary: `已复制 ${basename(path)}` }
    case 'move_path':
      mkdirSync(dirname(pathTo), { recursive: true })
      renameSync(path, pathTo)
      return { ok: true, content: `已移动到 ${pathTo}`, summary: `已移动 ${basename(path)}` }
    case 'mkdir':
      mkdirSync(path, { recursive: true })
      return { ok: true, content: `已创建 ${path}`, summary: `已创建目录 ${basename(path)}` }
    case 'write_text': {
      const content = typeof args.options?.content === 'string' ? args.options.content : ''
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, content, 'utf-8')
      return { ok: true, content: `已写入 ${path}`, summary: `已写入 ${basename(path)}` }
    }
    case 'delete_path': {
      await shell.trashItem(path)
      return { ok: true, content: `已移入回收站：${path}`, summary: `已删除 ${basename(path)}` }
    }
    case 'download_file': {
      const dest = path || join(defaultDownloadDir(ctx.downloadDir), basename(new URL(url).pathname) || 'download.bin')
      return downloadHttps(url, dest)
    }
    case 'run_installer':
      return shellOpen(path)
    case 'download_and_install': {
      const dir = defaultDownloadDir(ctx.downloadDir)
      mkdirSync(dir, { recursive: true })
      const fileName = basename(new URL(url).pathname) || 'installer.bin'
      const dest = join(dir, fileName)
      const dl = await downloadHttps(url, dest)
      if (!dl.ok) return dl
      await shell.openPath(dirname(dest))
      const run = await shellOpen(dest)
      return {
        ok: run.ok,
        content: `${dl.content}\n${run.content}`,
        summary: `已下载并开始安装 ${fileName}`
      }
    }
    case 'import_to_ackem': {
      const importsDir = join(ctx.dataRoot, 'imports')
      mkdirSync(importsDir, { recursive: true })
      const dest = join(importsDir, basename(path))
      copyFileSync(path, dest)
      return {
        ok: true,
        content: `已复制到 ${dest}`,
        summary: `已导入 ${basename(path)} 到 Ackem`
      }
    }
    default:
      return { ok: false, content: `未知 action: ${action}`, summary: '执行失败' }
  }
}
