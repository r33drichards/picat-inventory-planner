#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
root="$PWD"
revision=2d00e3a456c2f7736940e1a1ed66e7b0aef8e021
build="$(mktemp -d)"
trap 'rm -rf "$build"' EXIT

git init -q "$build"
git -C "$build" fetch -q --depth 1 https://github.com/r33drichards/picat.git "$revision"
git -C "$build" checkout -q --detach FETCH_HEAD
make -C "$build/emu" -f Makefile.emscripten -f "$root/wasm.mk" \
    -j "${JOBS:-$(getconf _NPROCESSORS_ONLN)}" \
    ENTRY_JS="$root/entry.js" INVENTORY_PI="$root/inventory.pi"

mkdir -p dist
cp "$build/emu/picat.js" dist/picat.js
cp "$build/emu/picat.wasm" dist/picat.wasm
cp "$build/LICENSE" dist/Picat-LICENSE.txt
