#!/bin/bash
set -e
cd /opt/kaput-stealth

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

sudo cp kaput-stealth.bundle.js /var/www/kaput/
sudo chown caddy:caddy /var/www/kaput/kaput-stealth.bundle.js
sudo chmod 644 /var/www/kaput/kaput-stealth.bundle.js
sudo systemctl reload caddy
echo "✅ Deployed"
