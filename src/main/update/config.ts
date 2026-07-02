import type { UpdateChannel } from '../../shared/updateTypes'
import { PLATFORM_ARCH, platformZipAssetName, platformFolderName } from '../../shared/platform'

export const UPDATE_USER_AGENT = 'Ackem-Desktop-Updater/1.0'

export const GITHUB = {
  owner: 'JasonLiu0826',
  repo: 'Ackem',
  apiLatest: 'https://api.github.com/repos/JasonLiu0826/Ackem/releases/latest',
  releasePage: 'https://github.com/JasonLiu0826/Ackem/releases/latest'
} as const

export const GITEE = {
  owner: 'jason_2005',
  repo: 'ackem',
  apiLatest: 'https://gitee.com/api/v5/repos/jason_2005/ackem/releases/latest',
  releasePage: 'https://gitee.com/jason_2005/ackem/releases'
} as const

export function zipAssetName(version: string): string {
  return platformZipAssetName(version)
}

export function greenFolderName(version: string): string {
  return platformFolderName(version)
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^v/i, '')
}

export type ResolvedChannel = Exclude<UpdateChannel, 'auto'>

export const CHANNEL_ORDER_AUTO: ResolvedChannel[] = ['gitee', 'github']
