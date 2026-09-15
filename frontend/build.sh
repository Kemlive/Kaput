#!/bin/bash
set -e
cd /opt/kaput-stealth

rm -rf /tmp/kaput-build
npx esbuild kaput-stealth.js \
  --bundle \
  --format=esm \
  --splitting \
  --entry-names=kaput-stealth.bundle \
  --chunk-names=chunk-[hash] \
  --outdir=/tmp/kaput-build \
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
  --external:url --external:worker_threads --external:child_process --external:net --external:tls --external:dns

# Clean old deploy, copy new
sudo rm -f /var/www/kaput/kaput-stealth*.js /var/www/kaput/chunk-*.js
sudo cp -r /tmp/kaput-build/* /var/www/kaput/
sudo chown -R caddy:caddy /var/www/kaput/
sudo find /var/www/kaput -type f -exec chmod 644 {} \;
sudo systemctl reload caddy
echo "✅ Deployed (ESM + splitting + Tor)"
