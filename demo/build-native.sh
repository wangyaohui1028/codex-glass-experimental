#!/bin/bash
set -euo pipefail

# Build only our independent preview app. Does not install, launch, or modify Codex.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="${1:-$PROJECT_DIR/build/native}"
APP_PATH="$OUTPUT_DIR/Codex Glass Preview.app"
MODULE_CACHE="$OUTPUT_DIR/swift-module-cache"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This native fixture requires macOS." >&2
  exit 1
fi
if [[ ! -f "$PROJECT_DIR/src/renderer.js" ]]; then
  echo "Missing src/renderer.js. Build from the complete codex-glass project." >&2
  exit 1
fi
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources/site/demo" "$APP_PATH/Contents/Resources/site/src" "$MODULE_CACHE"
/usr/bin/xcrun swiftc "$SCRIPT_DIR/native-macos.swift" -module-cache-path "$MODULE_CACHE" -framework AppKit -framework WebKit -O -o "$APP_PATH/Contents/MacOS/CodexGlassPreview"
/bin/cp "$SCRIPT_DIR/index.html" "$APP_PATH/Contents/Resources/site/demo/index.html"
/bin/cp "$PROJECT_DIR/src/renderer.js" "$APP_PATH/Contents/Resources/site/src/renderer.js"
cat > "$APP_PATH/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Codex Glass Preview</string>
  <key>CFBundleDisplayName</key><string>Codex Glass Preview (Independent)</string>
  <key>CFBundleIdentifier</key><string>local.codex-glass.independent-preview</string>
  <key>CFBundleExecutable</key><string>CodexGlassPreview</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict></plist>
PLIST
/usr/bin/plutil -lint "$APP_PATH/Contents/Info.plist"
/usr/bin/codesign --force --sign - "$APP_PATH"
/usr/bin/codesign --verify --deep --strict "$APP_PATH"
echo "Built independent offline material preview: $APP_PATH"
echo "This app has not been launched. It does not modify the official Codex app."
