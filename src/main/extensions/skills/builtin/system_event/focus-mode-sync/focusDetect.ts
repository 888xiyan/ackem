import { execSync } from 'node:child_process'

export type FocusDetectResult = boolean | null

export type FocusDetectFn = () => FocusDetectResult

let detectFn: FocusDetectFn = defaultFocusDetect

export function setFocusDetectFn(fn: FocusDetectFn): void {
  detectFn = fn
}

export function resetFocusDetectFn(): void {
  detectFn = defaultFocusDetect
}

/** GNOME：通过 gsettings 查询通知勿扰状态 */
function linuxGnomeFocusDetect(): FocusDetectResult {
  try {
    const out = execSync('gsettings get org.gnome.desktop.notifications show-banners 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000
    }).trim()
    if (out === 'false') return true   // 通知关闭 → 专注模式
    if (out === 'true') return false   // 通知开启 → 正常模式
    return null
  } catch {
    return null
  }
}

/** Windows：查询注册表中的通知静音设置 */
function windowsFocusDetect(): FocusDetectResult {
  try {
    const script =
      "Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' " +
      '-Name NOC_GLOBAL_SETTING_TOASTENABLED -ErrorAction SilentlyContinue | ' +
      'Select-Object -ExpandProperty NOC_GLOBAL_SETTING_TOASTENABLED'
    const out = execSync(`powershell -NoProfile -NonInteractive -Command "${script}"`, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    }).trim()
    if (out === '0') return true
    if (out === '1') return false
    return null
  } catch {
    return null
  }
}

function defaultFocusDetect(): FocusDetectResult {
  if (process.platform === 'linux') return linuxGnomeFocusDetect()
  if (process.platform === 'win32') return windowsFocusDetect()
  return null
}

/** true = 专注/勿扰倾向 · false = 正常 · null = 未知 */
export function detectFocusAssistActive(): FocusDetectResult {
  return detectFn()
}
