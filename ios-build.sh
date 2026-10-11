#!/usr/bin/env bash
# 未签名 IPA（GitHub macos-latest / 本地 Xcode）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
IOS_DIR="${ROOT}/ios/App"
ARCHIVE="${RUNNER_TEMP:-/tmp}/ustation-ios.xcarchive"
OUT_IPA="${ROOT}/app-ios.ipa"

if [ ! -d "$IOS_DIR" ]; then
  echo "::error::ios/App missing — run npx cap add ios first"
  exit 1
fi

cd "$IOS_DIR"

if [ -f Podfile ]; then
  pod install --repo-update
fi

SCHEME="App"
# Prefer the workspace (created by CocoaPods); fall back to the bare project.
# xcodebuild needs -project (not -workspace) for a .xcodeproj.
if [ -d "App.xcworkspace" ]; then
  PROJECT_ARG="-workspace"
  PROJECT_REF="App.xcworkspace"
elif [ -d "App.xcodeproj" ]; then
  PROJECT_ARG="-project"
  PROJECT_REF="App.xcodeproj"
else
  echo "::error::neither App.xcworkspace nor App.xcodeproj found"
  ls -la
  exit 1
fi

echo "[ios-build] ${PROJECT_ARG}=${PROJECT_REF} scheme=${SCHEME}"

xcodebuild \
  "$PROJECT_ARG" "$PROJECT_REF" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  archive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  | tee xcodebuild.log

if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo "::error::xcodebuild archive failed"
  tail -80 xcodebuild.log || true
  exit 1
fi

APP_GLOB="$ARCHIVE/Products/Applications/*.app"
APP_PATH="$(ls -d $APP_GLOB 2>/dev/null | head -1)"
if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
  echo "::error::.app not found under archive"
  find "$ARCHIVE" -maxdepth 5 -type d -name '*.app' || true
  exit 1
fi

STAGE="${RUNNER_TEMP:-/tmp}/ipa-stage"
rm -rf "$STAGE"
mkdir -p "$STAGE/Payload"
cp -R "$APP_PATH" "$STAGE/Payload/"
cd "$STAGE"
rm -f "$OUT_IPA"
zip -qr "$OUT_IPA" Payload

echo "[ios-build] OK $OUT_IPA ($(stat -f%z "$OUT_IPA" 2>/dev/null || stat -c%s "$OUT_IPA") bytes)"
