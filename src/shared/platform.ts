/**
 * 平台常量模块
 *
 * 集中管理所有平台差异常量，避免 process.platform 散落在各处。
 * 上层模块统一引用此文件，新增平台只需在此修改。
 */

export const PLATFORM = process.platform as 'win32' | 'linux' | 'darwin'
export const IS_WIN = PLATFORM === 'win32'
export const IS_LINUX = PLATFORM === 'linux'
export const IS_MAC = PLATFORM === 'darwin'

/** 主二进制文件名 */
export const APP_BINARY_NAME = IS_WIN ? 'Ackem.exe' : 'ackem'

/** 启动器二进制文件名 */
export const LAUNCHER_BINARY_NAME = IS_WIN ? 'AckemLauncher.exe' : 'ackem-launcher'

/** Python 可执行文件名（相对于 runtime 目录） */
export const PYTHON_EXE = IS_WIN ? 'python.exe' : 'bin/python3'

/** 平台架构标识，用于构建产物命名 */
export const PLATFORM_ARCH = IS_WIN ? 'win-x64' : 'linux-x64'

/** electron-builder 解压目录名 */
export const ELECTRON_UNPACKED_DIR = IS_WIN ? 'win-unpacked' : 'linux-unpacked'

/** 根据版本生成平台 zip 包名 */
export function platformZipAssetName(version: string): string {
  const v = version.replace(/^v/i, '')
  return `Ackem-${v}-${PLATFORM_ARCH}.zip`
}

/** 根据版本生成平台文件夹名 */
export function platformFolderName(version: string): string {
  const v = version.replace(/^v/i, '')
  return `Ackem-${v}-${PLATFORM_ARCH}`
}
