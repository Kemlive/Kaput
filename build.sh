#!/bin/bash
set -e
cd /opt/kaput-stealth

rm -rf /tmp/kaput-build
npx esbuild frontend/lethe.js \
  --bundle --format=esm --splitting \
  --entry-names=lethe.bundle --chunk-names=chunk-lethe-wallet-[hash] \
  --outdir=/tmp/kaput-build --platform=browser \
  --minify --legal-comments=none --minify --legal-comments=none --define:global=globalThis \
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
  --external:url --external:worker_threads --external:child_process \
  --external:net --external:tls --external:dns

sudo rm -f /var/www/kaput/lethe.bundle.js /var/www/kaput/chunk-lethe-wallet-*.js
sudo cp -r /tmp/kaput-build/* /var/www/kaput/
sudo cp /opt/kaput-stealth/frontend/wallet.html /var/www/kaput/wallet.html
sudo chown -R caddy:caddy /var/www/kaput/
sudo find /var/www/kaput -type f -exec chmod 644 {} \;
sudo systemctl reload caddy
echo "✅ Deployed"
