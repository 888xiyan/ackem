/**
 * 桌面代理执行器平台路由
 *
 * 根据运行平台动态选择对应的适配器实现。
 */
import { PLATFORM } from '../../../shared/platform'
import type { DesktopAgentAction, UseComputerArgs } from '../../../shared/desktopAgent'
import type { ExecuteResult } from './common'

let executorModule: typeof import('./win/executor') | typeof import('./linux/executor')

if (PLATFORM === 'linux') {
  // Dynamic import 避免 TypeScript 在非 Linux 上检查 linux/executor 的类型错误
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  executorModule = require('./linux/executor') as typeof import('./linux/executor')
} else {
  executorModule = require('./win/executor') as typeof import('./win/executor')
}

export async function executeDesktopAgentAction(
  action: DesktopAgentAction,
  args: UseComputerArgs,
  ctx: { dataRoot: string; downloadDir?: string; cwd: string }
): Promise<ExecuteResult> {
  return executorModule.executeDesktopAgentAction(action, args, ctx)
}
