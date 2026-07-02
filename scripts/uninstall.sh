#!/bin/bash
# Ackem Linux 卸载脚本
# 由 uninstall.ts 在卸载时调用

set -e

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/Ackem"
DESKTOP_FILE="$HOME/.local/share/applications/ackem.desktop"

# 解析参数
DELETE_DATA=false
REMOVE_APP=false

for arg in "$@"; do
  case "$arg" in
    --delete-data) DELETE_DATA=true ;;
    --remove-app) REMOVE_APP=true ;;
  esac
done

echo "Ackem 卸载中..."

# 移除 .desktop 文件
if [ -f "$DESKTOP_FILE" ]; then
  rm -f "$DESKTOP_FILE"
  echo "已移除桌面快捷方式"
fi

# 可选删除数据目录
if [ "$DELETE_DATA" = true ] && [ -d "$DATA_DIR" ]; then
  rm -rf "$DATA_DIR"
  echo "已删除数据目录：$DATA_DIR"
fi

echo "Ackem 卸载完成。"
