#!/bin/bash
set -e
cd /opt/kaput-stealth

rm -rf /tmp/railgun-build
mkdir -p /tmp/railgun-build

npx esbuild frontend/railgun-worker-wrapper.js \
  --bundle --format=esm --splitting \
  --inject:frontend/railgun-shims.js \
  --alias:@railgun-community/poseidon-hash-wasm=./frontend/poseidon-shim.js \
  --alias:@railgun-community/curve25519-scalarmult-wasm=./frontend/curve25519-shim.js \
  --alias:@railgun-community/curve25519-scalarmult-wasm/pkg-cjs/curve25519_scalarmult_wasm.js=./frontend/curve25519-shim.js \
  --alias:@railgun-community/curve25519-scalarmult-wasm/pkg-cjs/curve25519_scalarmult_wasm=./frontend/curve25519-shim.js \
  --loader:.wasm=binary \
  --outdir=/tmp/railgun-build \
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
  --alias:path=path-browserify \
  --external:fs --external:fs/promises --external:os \
  --external:http --external:https --external:zlib \
  --external:url --external:worker_threads --external:child_process \
  --external:net --external:tls --external:dns

sudo rm -f /var/www/kaput/railgun-worker*.js /var/www/kaput/chunk-KUF*.js
sudo cp /tmp/railgun-build/railgun-worker-wrapper.js /var/www/kaput/
sudo cp /tmp/railgun-build/railgun-worker-core-*.js /var/www/kaput/
sudo cp /tmp/railgun-build/chunk-*.js /var/www/kaput/
sudo chown caddy:caddy /var/www/kaput/railgun-worker*.js /var/www/kaput/chunk-*.js
sudo chmod 644 /var/www/kaput/railgun-worker*.js /var/www/kaput/chunk-*.js
sudo systemctl reload caddy
echo "✅ Railgun worker deployed"
