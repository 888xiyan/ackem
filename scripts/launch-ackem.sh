#!/bin/bash
# Ackem Linux 启动脚本
# 用于直接启动 ackem 可执行文件

DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/ackem" "$@"
