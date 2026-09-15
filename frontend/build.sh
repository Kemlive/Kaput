#!/bin/bash
set -e
cd "$(dirname "$0")"

npx esbuild kaput-stealth.js \
  --bundle \
  --format=iife \
  --outfile=kaput-stealth.bundle.js \
  --platform=browser \
  --define:global=globalThis \
  --define:process.env.NODE_ENV='"production"' \
  --alias:crypto=crypto-browserify \
  --alias:stream=stream-browserify \
  --alias:events=events \
  --alias:util=util \
  --alias:process=process \
  --alias:buffer=buffer \
  --alias:string_decoder=string_decoder \
  --external:fs --external:fs/promises --external:os --external:path \
  --external:http --external:https --external:zlib \
  --external:url --external:worker_threads --external:child_process

echo "✅ Built kaput-stealth.bundle.js"
