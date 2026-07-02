# Ackem Linux 适配施工图纸

> 生成日期：2026-07-01
> 分支：feat/system-linux-adapt
> 基线：repo-base-linux

---

## 现状评估

当前 `feat/system-linux-adapt` 分支**尚未进行实质性适配工作**。`linux_adapt/` 目录仅包含一个从根目录移入的 `tsconfig.web.json`（内容未改）。分支上的改动限于文档新增和清理。

**核心问题**：项目从第一天起就是 Windows-only 设计，约 **30+ 个文件**存在 Windows 硬编码，涉及进程管理、PowerShell 调用、Win32 API、路径约定、构建打包等。

---

## 总览：改造分层图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Linux 适配施工分层                             │
│                                                                  │
│  Layer 6: 分发层    electron-builder / CI / 更新渠道              │
│  Layer 5: 脚本层    .ps1→.sh / 构建脚本 / Go启动器               │
│  Layer 4: 桌面集成  快捷方式 / 卸载 / 首次运行 / 前台检测         │
│  Layer 3: 桌面代理  执行器 / 解析器 / 策略 / 机器映射             │
│  Layer 2: 系统服务  媒体会话 / 专注模式 / 语音服务                │
│  Layer 1: 基础层    路径系统 / 数据目录 / 平台常量                 │
│                                                                  │
│  施工顺序: Layer 1 → 2 → 3 → 4 → 5 → 6                          │
│  每层完成后可独立验证，上层依赖下层                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1：基础层（路径系统 / 数据目录 / 平台常量）

> **优先级 P0** — 所有上层依赖此层。必须最先完成。

### 1.1 创建平台常量模块

**新建文件**：`src/shared/platform.ts`

```typescript
// 集中管理所有平台差异常量
export const PLATFORM = process.platform as 'win32' | 'linux' | 'darwin'

export const APP_BINARY_NAME = PLATFORM === 'win32' ? 'Ackem.exe' : 'ackem'

export const LAUNCHER_BINARY_NAME = PLATFORM === 'win32' ? 'AckemLauncher.exe' : 'ackem-launcher'

export const PYTHON_EXE = PLATFORM === 'win32' ? 'python.exe' : 'bin/python3'

export const PLATFORM_ARCH = PLATFORM === 'win32' ? 'win-x64' : 'linux-x64'

export const ELECTRON_UNPACKED_DIR = PLATFORM === 'win32' ? 'win-unpacked' : 'linux-unpacked'

export function platformZipAssetName(version: string): string {
  const v = version.replace(/^v/i, '')
  return `Ackem-${v}-${PLATFORM_ARCH}.zip`
}

export function platformFolderName(version: string): string {
  const v = version.replace(/^v/i, '')
  return `Ackem-${v}-${PLATFORM_ARCH}`
}
```

### 1.2 改造路径系统

**文件**：`src/main/paths.ts` — 3 处改动

| 行 | 现状 | 改造 |
|----|------|------|
| 20-23 | `getLocalAppDataRoot()` 硬编码 `LOCALAPPDATA` / `AppData\Local` | 添加 Linux 分支 → `$XDG_DATA_HOME` 或 `~/.local/share` |
| 27-28 | `resolveDataRoot()` 两模式 | 增加 `xdg` 模式（或让 `localappdata` 模式在 Linux 上自动映射到 XDG） |
| 42-49 | `formatDataRootDisplayPaths` 使用 `%LOCALAPPDATA%\\` | Linux 显示 `~/.local/share/Ackem` |

```typescript
// paths.ts 改造示意
import { PLATFORM } from '../shared/platform'

export function getLocalAppDataRoot(): string {
  if (PLATFORM === 'linux') {
    const xdg = process.env.XDG_DATA_HOME
    const base = xdg && xdg.length > 0 ? xdg : join(homedir(), '.local', 'share')
    return join(base, 'Ackem')
  }
  // 原有 Windows 逻辑不变
  const la = process.env.LOCALAPPDATA
  const base = la && la.length > 0 ? la : join(homedir(), 'AppData', 'Local')
  return join(base, 'Ackem')
}
```

### 1.3 改造数据库路径

**文件**：`src/main/db/paths.ts`

- 第 6 行：注释中的 `%LOCALAPPDATA%` → 改为平台无关描述

### 1.4 改造便携环境

**文件**：`src/main/portableEnv.ts`

- 第 10 行：`PORTABLE_EXECUTABLE_FILE` 检测逻辑 — Linux 上不存在 `.exe`，需改为检测同名无扩展名文件

---

## Layer 2：系统服务层（语音 / 媒体 / 专注模式）

> **优先级 P1** — 影响核心用户体验，但各模块独立可逐个击破。

### 2.1 语音服务 — GPT-SoVITS 路径修复

**文件**：`voice-service/gpt_sovits_process.py` — 3 处

| 行 | 现状 | 改造 |
|----|------|------|
| 37 | `_is_gpt_sovits_home` 检查 `python.exe` | → 检查 `python.exe` **或** `bin/python3` |
| 70 | `python_exe = self.home / "runtime" / "python.exe"` | → 根据平台选择 `python.exe` 或 `bin/python3` |
| 92 | `creationflags=CREATE_NO_WINDOW` | Linux 不受影响，但可加 `start_new_session=True` |

```python
# gpt_sovits_process.py 改造示意
import sys

def _is_gpt_sovits_home(path: Path) -> bool:
    if not (path / "api_v2.py").is_file():
        return False
    if sys.platform == "win32":
        return (path / "runtime" / "python.exe").is_file()
    else:
        return (path / "runtime" / "bin" / "python3").is_file()

def _resolve_python_exe(self) -> Path:
    if sys.platform == "win32":
        return self.home / "runtime" / "python.exe"
    else:
        return self.home / "runtime" / "bin" / "python3"
```

### 2.2 语音服务 — 模型路径 XDG 适配

**文件**：`voice-service/server.py` — 第 46-57 行

```python
# 当前仅用 APPDATA
appdata = Path(os.environ.get("APPDATA", ""))

# 改造：增加 XDG 回退
if sys.platform == "linux":
    xdg = os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")
    voice_models = Path(xdg) / "Ackem" / "voice-models"
else:
    appdata = Path(os.environ.get("APPDATA", ""))
    voice_models = appdata / "Ackem" / "voice-models" if appdata else None
```

### 2.3 语音服务 — Python 依赖精简

**文件**：`voice-service/requirements.txt`

- `pyttsx3` 和 `winrt-*` 已有 `sys_platform == "win32"` 条件约束，Linux 上 pip 会自动跳过
- 无需修改

### 2.4 媒体会话 — MPRIS 集成（可选）

**文件**：`src/main/mediaSession.ts` — 第 40 行

```typescript
// 当前：非 Win 直接返回空
if (process.platform !== 'win32') return EMPTY

// 改造：Linux 上通过 D-Bus 查询 MPRIS
if (process.platform === 'linux') {
  return queryMprisMediaSession()  // 新增函数
}
```

MPRIS 查询可用 `dbus-send` 或 `playerctl` 命令行工具：
```bash
playerctl -f '{{player}}|{{title}}|{{artist}}' metadata 2>/dev/null
```

### 2.5 前台窗口检测 — X11/Wayland 适配

**文件**：`src/main/extensions/plugins/builtin/behavior/foreground-detect/poll.ts` — 第 24 行

```typescript
// 当前：非 Win 返回空
if (process.platform !== 'win32') return ''

// 改造：Linux 上通过 xdotool 获取
if (process.platform === 'linux') {
  return getLinuxActiveWindow()  // 新增函数
}
```

Linux 实现：
```bash
xdotool getactivewindow getwindowname 2>/dev/null
# 或 Wayland:
wlr-foreign-toplevel-management  # 需要协议支持
```

### 2.6 专注模式检测 — D-Bus 适配

**文件**：`src/main/extensions/skills/builtin/system_event/focus-mode-sync/focusDetect.ts` — 第 18 行

```typescript
// 当前：非 Win 返回 null
if (process.platform !== 'win32') return null

// 改造：Linux 上通过 D-Bus 查 GNOME/KDE 勿扰模式
if (process.platform === 'linux') {
  return getLinuxDndState()  // 新增函数
}
```

Linux 实现：
```bash
# GNOME
gsettings get org.gnome.desktop.notifications show-banners
# KDE
kreadconfig5 --file kwinrc --group Windows --key FocusPolicy
```

### 2.7 嵌入模型解压 — 统一使用 Node.js

**文件**：`src/main/memory/embedding/modelManager.ts` — 第 202-209 行

当前已分支处理（Win 用 PowerShell `Expand-Archive`，非 Win 用 `unzip`），可进一步统一为纯 Node.js 方案：

```typescript
// 可选改造：用 Node.js 内置或 adm-zip 替代所有外部命令
import { execSync } from 'node:child_process'
// 或直接用 unzipper 库（已在依赖中）
```

---

## Layer 3：桌面代理层（执行器 / 解析器 / 策略 / 机器映射）

> **优先级 P1** — 这是最大的改造块。桌面代理的 `adapters/` 目录设计上支持多平台，只需新增 Linux 适配器。

### 架构策略

```
src/main/desktop-agent/
├── adapters/
│   ├── win/
│   │   └── executor.ts      # 现有（不变）
│   └── linux/
│       └── executor.ts      # 新增 ★
├── parsers/
│   ├── win/
│   │   ├── shortcuts.ts     # 现有（不变）
│   │   ├── steamLibraries.ts
│   │   └── epicManifests.ts
│   └── linux/
│       ├── desktopEntries.ts # 新增 ★
│       └── steamLibraries.ts # 新增 ★
├── policy.ts                # 改造 ●
├── machine-map/
│   └── collector.ts         # 改造 ●
└── investigation/
    └── runInvestigation.ts  # 改造 ●
```

图例：★ 新建文件 &nbsp;&nbsp; ● 改造现有文件

### 3.1 新建 Linux 执行器 ★

**新建文件**：`src/main/desktop-agent/adapters/linux/executor.ts`

核心函数对照：

| 功能 | Windows (`win/executor.ts`) | Linux 实现方案 |
|------|---------------------------|---------------|
| `shellOpen()` | `shell.openPath()` ✅ 跨平台 | 直接复用，不变 |
| `runPowerShell()` | `spawn('powershell.exe')` | `spawn('bash', ['-c', script])` |
| `closeAppTarget()` | PowerShell `Get-Process \| CloseMainWindow()` | `kill <pid>` 或 `pkill -f <name>` |
| `openAppTarget()` | PowerShell `Start-Process` | `spawn` 直接启动，或 `xdg-open` |
| `listFolder/readTextFile/searchFiles/grepText` | 纯 Node.js | **直接复用**（从 `win/executor.ts` 提取公共函数） |
| `downloadHttps/download_and_install` | fetch + fs | **直接复用** |
| `delete_path` | `shell.trashItem()` ✅ 跨平台 | 直接复用 |

**实现要点**：将 `win/executor.ts` 中与平台无关的工具函数（`listFolder`、`readTextFile`、`searchFiles`、`grepText`、`downloadHttps`）提取到共享模块 `adapters/common.ts`，两个平台适配器共用。

```typescript
// adapters/linux/executor.ts 核心差异函数示意

import { spawn } from 'node:child_process'
import { shell } from 'electron'

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
  // 用 pkill 按进程名终止
  const result = await runBash(`pkill -f '${target}' 2>/dev/null; echo $?`)
  const ok = result.output?.trim() === '0'
  return {
    ok,
    content: ok ? `已终止 ${target}` : (result.output || '未找到进程'),
    summary: ok ? `已关闭 ${target}` : `未能关闭 ${target}`
  }
}

async function openAppTarget(target: string): Promise<ExecuteResult> {
  // Linux: xdg-open 或直接 spawn
  const result = await runBash(`xdg-open '${target}' 2>/dev/null &`)
  return { ok: true, content: `已启动 ${target}`, summary: `已打开 ${target}` }
}
```

### 3.2 改造执行器路由

**搜索**：`src/main/` 中 `import ... from ... adapters/win/executor` 的引用

需要在导入处增加平台判断，动态加载对应适配器：

```typescript
// 动态路由示意
const platform = process.platform
const executor = platform === 'linux'
  ? require('./adapters/linux/executor')
  : require('./adapters/win/executor')
```

或者更好的方案：在 `adapters/` 下创建 `index.ts` 路由文件。

### 3.3 新建 Linux 应用解析器 ★

**新建文件**：`src/main/desktop-agent/parsers/linux/desktopEntries.ts`

解析 `.desktop` 文件（INI 格式），扫描目录：
- `/usr/share/applications/`
- `/usr/local/share/applications/`
- `~/.local/share/applications/`

```typescript
// 解析 .desktop 文件示意
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function scanDesktopEntries(): DesktopEntry[] {
  const dirs = [
    '/usr/share/applications',
    '/usr/local/share/applications',
    join(homedir(), '.local/share/applications')
  ]
  const results: DesktopEntry[] = []
  for (const dir of dirs) {
    // 读取 .desktop 文件，解析 Name= / Exec= / Icon= 等键
    // INI 格式简单，无需外部库
  }
  return results
}
```

### 3.4 新建 Linux Steam 解析器 ★

**新建文件**：`src/main/desktop-agent/parsers/linux/steamLibraries.ts`

Linux Steam 路径：
- `~/.steam/steam/`（传统）
- `~/.local/share/Steam/`（标准）
- Flatpak: `~/.var/app/com.valvesoftware.Steam/.local/share/Steam/`
- 库 VDF 格式与 Windows 相同，**可复用解析逻辑**

### 3.5 改造桌面代理策略

**文件**：`src/main/desktop-agent/policy.ts` — 5 处

| 行 | 现状 | 改造 |
|----|------|------|
| 13-22 | `BLOCKED_PROCESS_NAMES`：`csrss.exe`、`explorer.exe` 等 | Linux 替换为 `systemd`、`gnome-shell`、`plasmashell`、`kwin_x11` |
| 24-27 | `SYSTEM_WRITE_PREFIXES`：`C:\windows\system32` | Linux 替换为 `/boot`、`/etc`、`/sys`、`/proc`、`/usr/lib/systemd` |
| 60-65 | `isSensitivePath()`：检查 `C:\` 前缀 | Linux 检查 `/etc`、`/boot`、`/sys`、`/proc`、`/root` |
| 73-77 | `isBlockedCloseTarget()`：检查 `.exe` 后缀 | Linux 改为前缀/包含匹配 |
| 39-46 | `expandPathTokens()`：支持 `%VAR%` 和 `~` | Linux 保留 `~` 展开，增加 `$VAR` / `${VAR}` 支持 |

```typescript
// policy.ts 改造示意
import { PLATFORM } from '../../../shared/platform'

const BLOCKED_PROCESS_NAMES_WIN = new Set([
  'csrss.exe', 'winlogon.exe', 'lsass.exe', 'services.exe',
  'smss.exe', 'system', 'registry', 'explorer.exe'
])

const BLOCKED_PROCESS_NAMES_LINUX = new Set([
  'systemd', 'init', 'gnome-shell', 'plasmashell',
  'kwin_x11', 'Xorg', 'wayland', 'dbus-daemon', 'pulseaudio'
])

// 运行时选择
const BLOCKED_PROCESS_NAMES = PLATFORM === 'linux'
  ? BLOCKED_PROCESS_NAMES_LINUX
  : BLOCKED_PROCESS_NAMES_WIN

const SYSTEM_WRITE_PREFIXES_WIN = ['c:\\windows\\system32', 'c:\\windows\\syswow64']
const SYSTEM_WRITE_PREFIXES_LINUX = ['/boot', '/etc', '/sys', '/proc', '/usr/lib/systemd']

const SYSTEM_WRITE_PREFIXES = PLATFORM === 'linux'
  ? SYSTEM_WRITE_PREFIXES_LINUX
  : SYSTEM_WRITE_PREFIXES_WIN
```

### 3.6 改造机器映射收集器

**文件**：`src/main/desktop-agent/machine-map/collector.ts` — 第 23-27 行

```typescript
// 当前：Windows 路径
function programRoots(): string[] {
  return [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    join(process.env.LOCALAPPDATA ?? '', 'Programs')
  ].filter(Boolean) as string[]
}

// 改造：增加 Linux 路径
function programRoots(): string[] {
  if (PLATFORM === 'linux') {
    return [
      '/usr/share/applications',
      '/usr/local/share/applications',
      join(homedir(), '.local/share/applications'),
      '/opt'
    ]
  }
  // 原有 Windows 逻辑...
}
```

### 3.7 改造调查模块

**文件**：`src/main/desktop-agent/investigation/runInvestigation.ts`

- 第 39-48 行：`programFilesRoots()` 同上
- 第 208-212 行：`runDocumentsInvestigation` 已用 `homedir()` + `Desktop`/`Documents`/`Downloads`，基本跨平台

---

## Layer 4：桌面集成层（快捷方式 / 卸载 / 首次运行）

> **优先级 P2** — 影响安装部署体验。

### 4.1 首次运行快捷方式

**文件**：`src/main/release/firstRun.ts` — 第 37-46 行

```typescript
// 当前：Windows .lnk + shell.writeShortcutLink()
// 改造：Linux 创建 .desktop 文件

if (process.platform === 'linux') {
  const desktopDir = join(homedir(), '.local', 'share', 'applications')
  const desktopEntry = `[Desktop Entry]
Type=Application
Name=Ackem
Exec=${process.execPath}
Icon=ackem
Categories=Utility;
Terminal=false`
  writeFileSync(join(desktopDir, 'ackem.desktop'), desktopEntry)
}
```

### 4.2 卸载流程

**文件**：`src/main/release/uninstall.ts` — 第 80-86 行

```typescript
// 当前：cmd.exe /c uninstall.bat
// 改造：Linux 使用 shell 脚本或直接 Node.js 操作
if (process.platform === 'linux') {
  // 移除 .desktop 文件
  // 删除数据目录
  // 不涉及注册表操作
}
```

### 4.3 创建卸载脚本

**新建文件**：`scripts/uninstall.sh`

```bash
#!/bin/bash
# Linux 卸载脚本
rm -f ~/.local/share/applications/ackem.desktop
echo "Ackem 已卸载。数据目录保留在 ~/.local/share/Ackem/"
```

---

## Layer 5：脚本与启动器层

> **优先级 P2** — 影响开发者构建和用户启动体验。

### 5.1 Go 启动器改造

**文件**：`launcher/main.go` — 5 处改造

| 问题 | 改造方案 |
|------|---------|
| 二进制名 `Ackem.exe` | 使用 `//go:build` 标签或运行时 `runtime.GOOS` 判断 |
| `syscall.SysProcAttr{HideWindow: false}` | 用构建标签分离：`main_windows.go` / `main_linux.go` |
| `kernel32.AllocConsole()` | `//go:build windows` 包裹 |
| `robocopySync()` | 替换为 `os.CopyFS()`（Go 1.21+）或 `rsync -a` exec |
| `sevenZipPath()` → `resources/tools/7za.exe` | Linux 查找 `7za` / `7zz` 在 PATH 或 `/usr/bin/` |
| `resolveStagingDir()` 硬编码 `win-x64` | 使用变量（从 `runtime.GOOS`/`GOARCH` 派生） |

**Go 文件组织建议**：
```
launcher/
├── main.go              # 公共逻辑
├── main_windows.go      # Windows 特定（_windows 构建标签）
├── main_linux.go        # Linux 特定（_linux 构建标签）
├── go.mod
└── ackem-launcher.mjs
```

### 5.2 创建 Linux 启动脚本

**新建文件**：`scripts/launch-ackem.sh`

```bash
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/ackem" "$@"
```

### 5.3 构建脚本平台化

**文件**：`scripts/build-green-release.mjs`

| 行 | 改造 |
|----|------|
| 19 | `greenName` 改为动态平台后缀 |
| 44 | `win-unpacked` → 平台变量 |
| 66 | `taskkill` → 平台判断 |
| 80 | `robocopy` → `fs.cpSync` 或平台命令 |
| 122 | `7zip-bin/win/x64/7za.exe` → 平台对应路径 |
| 177 | `patch-exe-metadata.mjs`（rcedit）→ Linux 跳过 |

### 5.4 PowerShell 脚本替换

| 当前 Windows 脚本 | Linux 替代 |
|-------------------|-----------|
| `voice-service/package-python.ps1` | `voice-service/package-python.sh`（或直接用 pip） |
| `scripts/generate-icons.ps1` | `scripts/generate-icons.sh`（ImageMagick） |
| `scripts/sync-icons.ps1` | 合并到 generate-icons |
| `scripts/uninstall.bat` | `scripts/uninstall.sh`（见 Layer 4） |
| `scripts/launch-ackem.bat` | `scripts/launch-ackem.sh`（见 5.2） |

### 5.5 语音服务 Python 嵌入

**文件**：`src/main/extensions/plugins/builtin/tool/tts-voice/voiceEnvironment.ts`

- 第 225-227 行：`ensureEmbeddedPython()` 运行 `package-python.ps1`
- Linux 上 `canAutoInstall` 已为 false，跳过即可
- 建议：Linux 上依赖系统 Python3（`apt install python3-pip`），无需嵌入

---

## Layer 6：分发层（构建配置 / CI / 更新渠道）

> **优先级 P2** — 最后完成，确保能产出可用的 Linux 包。

### 6.1 electron-builder 增加 Linux 目标

**文件**：`electron-builder.yml`

在现有 `win:` 和 `nsis:` 配置后添加：

```yaml
linux:
  icon: build/icon.png
  target:
    - target: AppImage
      arch:
        - x64
    - target: dir
      arch:
        - x64
  category: Utility
  artifactName: ${productName}-${version}-linux-${arch}.${ext}
  executableName: ackem

# NSIS 仅 Windows，不需要额外排除（electron-builder 自动按平台选择）
```

同时修改 `extraFiles`（第 32-34 行）为条件性：

```yaml
extraFiles:
  - from: scripts/uninstall.bat
    to: Uninstall Ackem.bat
  - from: scripts/uninstall.sh
    to: uninstall.sh
  - from: scripts/launch-ackem.sh
    to: launch-ackem.sh
```

### 6.2 更新系统平台化

| 文件 | 改造 |
|------|------|
| `src/main/update/config.ts` 第 21、26 行 | `zipAssetName()` / `greenFolderName()` → 使用 `PLATFORM_ARCH` 变量 |
| `src/main/update/installSync.ts` 第 27-37 行 | `robocopySync()` → Node.js `fs.cpSync()` |
| `src/main/update/preflight.ts` 第 7-12 行 | 硬编码 `AckemLauncher.exe` / `.cmd` → 使用 `LAUNCHER_BINARY_NAME` |
| `src/main/update/checkRelease.ts` 第 54 行 | `a.name?.includes('win-x64')` → 动态平台匹配 |
| `src/main/update/zipVerify.ts` 第 6-18 行 | `resolve7zaPath()` → 支持 Linux 路径 |

### 6.3 CI 增加 Linux Runner

**文件**：`.github/workflows/ci.yml`

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest]   # ← 增加 ubuntu-latest
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install Linux system deps
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y p7zip-full xdotool
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  build-linux:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: |
          sudo apt-get update
          sudo apt-get install -y p7zip-full build-essential python3
      - run: npm ci
      - run: npm run prepare:embedding-models
      - run: npm run build
      - name: Build AppImage
        run: npx electron-builder --config electron-builder.yml --linux AppImage --x64
      - uses: actions/upload-artifact@v4
        with:
          name: ackem-linux-x64
          path: dist/*.AppImage
```

### 6.4 tsconfig 归位

当前 `tsconfig.web.json` 被移到了 `linux_adapt/`，但 `package.json` 的 `typecheck` 脚本仍引用 `tsconfig.web.json`。需要决策：

- **方案 A**：保留在 `linux_adapt/tsconfig.web.json`，修改 `package.json` 脚本路径
- **方案 B**：移回根目录，`linux_adapt/` 仅放 Linux 特有的差异配置

推荐方案 B（`linux_adapt/` 保持干净，只放真正的适配文件）。

---

## 施工路线图

```
Week 1-2  ████████████  Layer 1: 基础层
          path.ts / platform.ts / db/paths.ts / portableEnv.ts
          验证: dataRoot 在 Linux 上正确指向 ~/.local/share/Ackem

Week 2-3  ████████████  Layer 2: 系统服务层
          语音服务 GPT-SoVITS / 媒体会话 MPRIS / 前台检测 / 专注模式
          验证: 语音服务在 Linux 上正常启动，TTS/ASR 可用

Week 3-5  ████████████████████████  Layer 3: 桌面代理层（最大块）
          linux/executor.ts / desktopEntries.ts / policy.ts 等
          验证: 桌面代理功能在 Linux 上正常工作

Week 5-6  ████████████  Layer 4: 桌面集成层
          .desktop 快捷方式 / 卸载 / 首次运行
          验证: 安装/卸载流程完整

Week 6-7  ████████████  Layer 5: 脚本与启动器
          Go 启动器 / .sh 脚本 / 构建脚本
          验证: npm run dev 可启动开发环境

Week 7-8  ████████████  Layer 6: 分发层
          electron-builder / CI / 更新系统
          验证: 产出可用的 AppImage，更新检查可用
```

---

## 改动清单汇总

| 层级 | 新建文件 | 改造文件 | 预计代码量 |
|------|---------|---------|-----------|
| Layer 1 基础层 | 1 (`shared/platform.ts`) | 3 | ~150 行 |
| Layer 2 系统服务 | 0 | 7 | ~200 行 |
| Layer 3 桌面代理 | 4 (executor/desktopEntries/steamLibraries + common) | 3 | ~600 行 |
| Layer 4 桌面集成 | 1 (`uninstall.sh`) | 2 | ~100 行 |
| Layer 5 脚本启动器 | 4 (launch.sh / Go platform files / package-python.sh) | 3 | ~300 行 |
| Layer 6 分发 | 0 | 5 | ~100 行 |
| **合计** | **~10** | **~23** | **~1550 行** |

---

## 风险提示

1. **Wayland 兼容性**：`xdotool` 在 Wayland 上不可用，需要 `wlr-foreign-toplevel-management` 协议或改用 `ydotool`。建议先支持 X11，Wayland 作为后续优化。

2. **ONNX Runtime**：`onnxruntime-node` 的 Linux ARM64 预编译包可能需验证，x64 没问题。

3. **GPU 加速**：CosyVoice / GPT-SoVITS 的 CUDA 依赖在 Linux 上需要 NVIDIA 驱动 + CUDA toolkit，文档需明确说明。

4. **Go 启动器交叉编译**：在 CI 的 `ubuntu-latest` 上编译 Windows `.exe` 需要 `GOOS=windows GOARCH=amd64`，反之亦然。
