#!/bin/sh
# Double-clicked from Finder. Keep the window it opens open while you print.
cd "$(dirname "$0")" || exit 1

if [ ! -f agent.py ]; then
  echo "agent.py is missing. Unzip the whole download and start the helper from inside the unzipped folder."
  echo ""
  echo "Press Return to close this window."
  read -r _
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 was not found on this Mac."
  echo "Open Terminal, run:   xcode-select --install"
  echo "Accept the install, wait for it to finish, then start this helper again."
  echo ""
  echo "Press Return to close this window."
  read -r _
  exit 1
fi

python3 agent.py
status=$?
echo ""
echo "The print helper has stopped. Press Return to close this window."
read -r _
exit "$status"
