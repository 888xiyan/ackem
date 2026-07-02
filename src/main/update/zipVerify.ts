import { spawnSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { PLATFORM } from '../../shared/platform'

export function resolve7zaPath(): string {
  if (PLATFORM === 'linux') {
    // Linux 优先使用系统 7za / 7zz，其次查找打包目录
    try {
      execSync('which 7zz 2>/dev/null', { stdio: 'pipe' })
      return '7zz'
    } catch {
      try {
        execSync('which 7za 2>/dev/null', { stdio: 'pipe' })
        return '7za'
      } catch {
        // fallback: 检查打包目录
      }
    }
    const candidates = [
      join(process.resourcesPath, 'tools', '7za'),
      join(process.resourcesPath, 'tools', '7zz'),
    ]
    if (app.isPackaged) {
      const installDir = join(process.resourcesPath, '..')
      candidates.push(join(installDir, 'resources', 'tools', '7za'))
    }
    for (const p of candidates) {
      if (existsSync(p)) return p
    }
    throw new Error('Missing 7za/7zz — install p7zip-full or p7zip-plugins')
  }
  const candidates = [
    join(process.resourcesPath, 'tools', '7za.exe'),
    join(process.resourcesPath, '..', 'tools', '7za.exe'),
  ]
  if (app.isPackaged) {
    const installDir = join(process.resourcesPath, '..')
    candidates.push(join(installDir, 'resources', 'tools', '7za.exe'))
  }
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error('Missing 7za.exe in resources/tools')
}

export function testZipIntegrity(zipPath: string): void {
  const sevenZip = resolve7zaPath()
  const r = spawnSync(`"${sevenZip}"`, [`t`, `"${zipPath}"`], { shell: true, stdio: 'pipe' })
  if (r.status !== 0) {
    const err = r.stderr?.toString() || r.stdout?.toString() || 'zip test failed'
    throw new Error(err.trim())
  }
}

export function extractZip(zipPath: string, outDir: string): void {
  const sevenZip = resolve7zaPath()
  const r = spawnSync(`"${sevenZip}"`, [`x`, `"${zipPath}"`, `-o"${outDir}"`, '-y'], {
    shell: true,
    stdio: 'pipe'
  })
  if (r.status !== 0) {
    const err = r.stderr?.toString() || r.stdout?.toString() || 'extract failed'
    throw new Error(err.trim())
  }
}
