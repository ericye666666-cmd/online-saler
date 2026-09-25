#!/bin/sh
# One-time setup of the print helper on a Mac. Run it once, as the person who
# logs in to this Mac (not with sudo), by pasting into Terminal:
#
#   sh ~/Downloads/DirectLoopPrintAgent/install_macos.sh
#
# Running it through `sh` is deliberate: Gatekeeper blocks double-clicking a
# downloaded script, but not a shell reading it. Afterwards the helper starts by
# itself at every login and is restarted if it stops, so nobody has to keep a
# Terminal window open. Rerunning it from a newer download upgrades it.

LABEL="ke.directloop.printagent"
QUEUE="Deli_DL-720C"
PORT=8719
HEALTH_URL="http://127.0.0.1:$PORT/health"
FILES="agent.py erp_agent.py legacy_product_labels.py README.md SOURCE.md version.json uninstall_macos.sh"

SRC_DIR=$(cd "$(dirname "$0")" && pwd)
INSTALL_DIR="$HOME/Library/Application Support/DirectLoopPrintAgent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/DirectLoopPrintAgent.log"
DOMAIN="gui/$(id -u)"

say() { printf '%s\n' "$*"; }
fail() {
  say ""
  say "SETUP DID NOT FINISH / 安装未完成: $*"
  exit 1
}

# --- Preflight -----------------------------------------------------------------

[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS only. / 此安装程序仅适用于 Mac。"
[ "$(id -u)" -ne 0 ] || fail "do not run it with sudo; run it as the normal Mac user. / 请不要用 sudo 运行，直接用平时登录的 Mac 账号运行。"
[ -f "$SRC_DIR/agent.py" ] || fail "agent.py is not next to this script in $SRC_DIR. Unzip the whole download first. / 找不到 agent.py，请先完整解压下载的 ZIP。"

# /usr/bin/python3 exists even before the Command Line Tools are installed; it
# is a stub that offers to install them. Only running it proves Python is there.
PYTHON=$(command -v python3 2>/dev/null)
if [ -z "$PYTHON" ] || ! "$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1; then
  xcode-select --install >/dev/null 2>&1
  say "python3 is not installed on this Mac yet."
  say "A window has opened asking to install the Command Line Tools: click Install, wait until it finishes,"
  say "then paste the same command again."
  say ""
  say "这台 Mac 还没有 python3。已弹出“命令行开发者工具”安装窗口：点击“安装”，等待完成后，"
  say "再粘贴运行同一条命令。"
  exit 1
fi
case "$PYTHON" in /*) ;; *) fail "could not find the full path of python3 ($PYTHON)." ;; esac
say "Using $PYTHON ($("$PYTHON" -c 'import platform; print(platform.python_version())'))"

xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

health_ok() {
  curl -fsS --noproxy '*' --max-time 2 "$HEALTH_URL" 2>/dev/null | grep -Eq '"status": ?"ok"'
}

# --- Stop any helper that is already running -------------------------------------

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || launchctl unload "$PLIST" >/dev/null 2>&1
sleep 1

# A helper started by hand (`python3 agent.py` in Terminal, or the .command
# launcher) holds the port. Stop it only when it is certainly ours: a Python
# process running agent.py from a DirectLoopPrintAgent folder. Anything else is
# left alone and the person is told what to close.
BLOCKED=""
for pid in $(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null); do
  cmd=$(ps -o command= -p "$pid" 2>/dev/null)
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
  case "$cmd" in
    *[Pp]ython*agent.py*)
      case "$cmd $cwd" in
        *DirectLoopPrintAgent*)
          say "Stopping the print helper that was started by hand (process $pid)."
          kill "$pid" 2>/dev/null
          sleep 1
          continue ;;
      esac ;;
  esac
  BLOCKED="$BLOCKED $pid"
done
if [ -n "$BLOCKED" ]; then
  sleep 1
  for pid in $BLOCKED; do
    if kill -0 "$pid" 2>/dev/null; then
      say ""
      say "Port $PORT is used by another program (process $pid: $(ps -o command= -p "$pid" 2>/dev/null))."
      say "If it is an old print helper, close its Terminal window, then run this installer again."
      say "端口 $PORT 被其他程序占用。如果是之前手动打开的打印助手，请关闭那个终端窗口后重新运行本命令。"
      exit 1
    fi
  done
fi

# --- Copy the helper out of Downloads --------------------------------------------

mkdir -p "$HOME/Library/Application Support" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs" \
  || fail "could not create folders under ~/Library."
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR" || fail "could not create $INSTALL_DIR."
for name in $FILES; do
  if [ -f "$SRC_DIR/$name" ]; then
    cp "$SRC_DIR/$name" "$INSTALL_DIR/$name" || fail "could not copy $name."
  elif [ "$name" != "version.json" ]; then
    fail "$name is missing from $SRC_DIR. Download and unzip the Mac helper again."
  fi
done
chmod 755 "$INSTALL_DIR/uninstall_macos.sh"

# --- Start at every login, restart if it stops -----------------------------------

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$PYTHON")</string>
    <string>$(xml_escape "$INSTALL_DIR/agent.py")</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$(xml_escape "$INSTALL_DIR")</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin</string>
    <key>PYTHONUNBUFFERED</key>
    <string>1</string>
    <key>PYTHONIOENCODING</key>
    <string>utf-8</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$LOG")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$LOG")</string>
</dict>
</plist>
EOF
[ -s "$PLIST" ] || fail "could not write $PLIST."
plutil -lint "$PLIST" >/dev/null 2>&1 || fail "the generated $PLIST is not valid."

if ! launchctl bootstrap "$DOMAIN" "$PLIST" 2>/dev/null; then
  # Older macOS, or a stale registration that bootout had not finished removing.
  launchctl load -w "$PLIST" 2>/dev/null
fi

say "Waiting for the print helper to answer..."
STARTED=""
i=0
while [ $i -lt 30 ]; do
  if health_ok; then STARTED=1; break; fi
  sleep 0.5
  i=$((i + 1))
done
if [ -z "$STARTED" ]; then
  say ""
  say "The print helper did not answer on $HEALTH_URL. Last lines of $LOG:"
  tail -n 20 "$LOG" 2>/dev/null
  fail "the helper is installed but not running. Send the lines above to the admin. / 打印助手已安装但没有运行，请把上面的内容发给管理员。"
fi
say "Print helper is running on http://127.0.0.1:$PORT."

# --- Print queue -------------------------------------------------------------------

QUEUE_NOTE=""
if lpstat -p "$QUEUE" >/dev/null 2>&1; then
  say "Print queue $QUEUE already exists."
else
  say "Looking for the Deli DL-720C on USB..."
  URI=$(lpinfo -v 2>/dev/null | awk '/usb:\/\//{print $2; exit}')
  if [ -z "$URI" ]; then
    QUEUE_NOTE=missing
  else
    say "Found $URI"
    say "Creating print queue $QUEUE. Type this Mac's login password if asked (nothing shows while you type)."
    say "正在创建打印队列。如提示输入密码，请输入这台 Mac 的开机密码（输入时屏幕不显示）。"
    if sudo lpadmin -p "$QUEUE" -E -v "$URI" -m drv:///sample.drv/generic.ppd; then
      cupsenable "$QUEUE" 2>/dev/null
      cupsaccept "$QUEUE" 2>/dev/null
      say "Print queue $QUEUE created."
    else
      QUEUE_NOTE=failed
    fi
  fi
fi

# --- Summary -------------------------------------------------------------------------

say ""
say "=================================================================="
say "Done. The print helper is installed and running."
say "  - It starts automatically every time this Mac user logs in, and restarts itself if it stops."
say "  - Nothing needs to be opened or typed before printing. In Operations, click Detect, then print."
say "  - Installed in: $INSTALL_DIR"
say "  - Log file:     $LOG"
say "  - To remove it: sh \"$INSTALL_DIR/uninstall_macos.sh\""
say "  - The Downloads folder can now be deleted."
say ""
say "完成。打印助手已安装并正在运行。"
say "  - 以后每次登录这台 Mac 都会自动启动；如果意外停止会自动重启。"
say "  - 打印前不需要再打开任何窗口或输入命令。在作业台点击“检测”，然后打印即可。"
say "  - 安装位置：$INSTALL_DIR"
say "  - 日志文件：$LOG"
say "  - 卸载方法：sh \"$INSTALL_DIR/uninstall_macos.sh\""
say "  - 下载文件夹现在可以删除。"
case "$QUEUE_NOTE" in
  missing)
    say ""
    say "PRINTER NOT FOUND: no USB printer is visible. Plug in the DL-720C, switch it on, check the USB-C hub/cable,"
    say "then run this same command again to create the print queue."
    say "未找到打印机：请插好 DL-720C 的 USB 线并打开电源，检查 USB-C 转接头，然后再运行一次同一条命令来创建打印队列。" ;;
  failed)
    say ""
    say "THE PRINT QUEUE WAS NOT CREATED (wrong password or no admin rights). Run this same command again."
    say "打印队列创建失败（密码错误或没有管理员权限）。请再运行一次同一条命令。" ;;
esac
say "=================================================================="
exit 0
