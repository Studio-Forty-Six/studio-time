#!/bin/bash
cd "$(dirname "$0")"

echo "Starting Studio Time..."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed yet."
  echo "Install it from https://nodejs.org (choose the LTS version), then double-click this file again."
  echo ""
  read -p "Press Return to close this window..."
  exit 1
fi

# Open the app in the browser shortly after the server starts
( sleep 1.5 && open "http://localhost:4173" ) &

node server.js
