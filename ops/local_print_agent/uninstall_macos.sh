#!/bin/sh
# Removes what install_macos.sh set up: the login item and the installed copy of
# the helper. The CUPS print queue is left in place; other programs may use it.
#
#   sh ~/Library/Application\ Support/DirectLoopPrintAgent/uninstall_macos.sh

LABEL="ke.directloop.printagent"
INSTALL_DIR="$HOME/Library/Application Support/DirectLoopPrintAgent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ "$(uname -s)" = "Darwin" ] || { echo "This uninstaller is for macOS only."; exit 1; }

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || launchctl unload "$PLIST" >/dev/null 2>&1
rm -f "$PLIST"
rm -rf "$INSTALL_DIR"

echo "The print helper was removed and will no longer start at login."
echo "The log file ~/Library/Logs/DirectLoopPrintAgent.log and the Deli_DL-720C print queue were kept."
echo "打印助手已卸载，登录时不再自动启动。日志文件和打印队列保留未删。"
