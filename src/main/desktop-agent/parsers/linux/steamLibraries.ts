/**
 * Linux Steam 库解析器
 *
 * 扫描 Linux 上常见的 Steam 安装路径，读取 libraryfolders.vdf 获取所有游戏库目录。
 * VDF 格式与 Windows 版相同，复用 VDF 解析逻辑。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

export type SteamGameEntry = {
  appId: string
  name: string
  installDir: string
  libraryPath: string
}

/** Linux Steam 安装路径候选项 */
const STEAM_BASE_DIRS = [
  join(homedir(), '.steam', 'steam'),
  join(homedir(), '.local', 'share', 'Steam'),
  join(homedir(), '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  '/usr/share/steam',
]

function parseVdfValue(text: string, key: string): string {
  // 查找 "key" "value" 或 "key"\t\t"value"
  const re = new RegExp(`"${key}"\\s*"([^"]*)"`)
  const m = text.match(re)
  return m ? m[1] : ''
}

function parseVdfBlock(text: string, blockName: string): string {
  const re = new RegExp(`"${blockName}"\\s*\\{([^}]*)\\}`, 's')
  const m = text.match(re)
  return m ? m[1] : ''
}

/** 解析 libraryfolders.vdf，返回所有库路径 */
function parseLibraryFolders(vdfPath: string): string[] {
  try {
    const text = readFileSync(vdfPath, 'utf-8')
    const libraryFoldersBlock = parseVdfBlock(text, 'libraryfolders')
    if (!libraryFoldersBlock) return []

    const paths: string[] = []
    // libraryfolders.vdf 格式:
    // "0" { "path" "/path/to/library" }
    // "1" { "path" "/path/to/library" }
    const folderRe = /"(\d+)"\s*\{([^}]*)\}/g
    let match
    while ((match = folderRe.exec(libraryFoldersBlock)) !== null) {
      const block = match[2]
      const p = parseVdfValue(block, 'path')
      if (p && existsSync(p)) paths.push(p)
    }
    return paths
  } catch {
    return []
  }
}

/** 扫描 Steam 库中的游戏 */
function scanSteamGames(libraryPath: string): SteamGameEntry[] {
  const steamAppsDir = join(libraryPath, 'steamapps')
  if (!existsSync(steamAppsDir)) return []

  const games: SteamGameEntry[] = []

  try {
    // 读取 common 目录中的游戏文件夹
    const commonDir = join(steamAppsDir, 'common')
    if (existsSync(commonDir)) {
      const entries = readdirSync(commonDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const appManifestPath = join(steamAppsDir, `appmanifest_${entry.name}.acf`)
          // 尝试查找匹配的 appmanifest
          try {
            const manifests = readdirSync(steamAppsDir)
            for (const mf of manifests) {
              if (mf.startsWith('appmanifest_') && mf.endsWith('.acf')) {
                const mfPath = join(steamAppsDir, mf)
                const mfText = readFileSync(mfPath, 'utf-8')
                const installDir = parseVdfValue(mfText, 'installdir')
                if (installDir === entry.name) {
                  const appId = parseVdfValue(mfText, 'appid')
                  const name = parseVdfValue(mfText, 'name')
                  games.push({
                    appId,
                    name: name || entry.name,
                    installDir: entry.name,
                    libraryPath,
                  })
                  break
                }
              }
            }
          } catch {
            // 无法读取时跳过
          }
        }
      }
    }
  } catch {
    // 权限不足跳过
  }

  return games
}

/** 解析所有 Steam 库路径 */
export function parseSteamLibraryPaths(): string[] {
  const paths: string[] = []
  for (const base of STEAM_BASE_DIRS) {
    if (!existsSync(base)) continue
    // 主库路径
    paths.push(base)

    // 读取 libraryfolders.vdf 获取额外库
    const vdfPath = join(base, 'steamapps', 'libraryfolders.vdf')
    if (existsSync(vdfPath)) {
      paths.push(...parseLibraryFolders(vdfPath))
    }
  }
  // 去重
  return [...new Set(paths)]
}

/** 扫描所有 Steam 库中的游戏 */
export function parseSteamLibraries(): SteamGameEntry[] {
  const allGames: SteamGameEntry[] = []
  const seen = new Set<string>()

  for (const libPath of parseSteamLibraryPaths()) {
    const games = scanSteamGames(libPath)
    for (const game of games) {
      const key = `${game.appId}:${game.installDir}`
      if (!seen.has(key)) {
        seen.add(key)
        allGames.push(game)
      }
    }
  }

  return allGames
}
