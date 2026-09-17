#!/bin/bash
set -e
cd /opt/kaput-stealth

rm -rf /tmp/lethe-pool-build
mkdir -p /tmp/lethe-pool-build

npx esbuild frontend/lethe-pool-worker-wrapper.js \
  --bundle --format=esm --splitting \
  --inject:frontend/railgun-shims.js \
  --alias:@railgun-community/poseidon-hash-wasm=./frontend/poseidon-shim.js \
  --alias:@railgun-community/curve25519-scalarmult-wasm=./frontend/curve25519-shim.js \
  --alias:@railgun-community/curve25519-scalarmult-wasm/pkg-cjs/curve25519_scalarmult_wasm.js=./frontend/curve25519-shim.js \
  --alias:@railgun-community/curve25519-scalarmult-wasm/pkg-cjs/curve25519_scalarmult_wasm=./frontend/curve25519-shim.js \
  --loader:.wasm=binary \
  --chunk-names=chunk-lethe-pool-[hash] \
  --outdir=/tmp/lethe-pool-build \
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

# Only touch files with our prefix — never the sandbox's chunk-railgun-*.
sudo rm -f /var/www/kaput/lethe-pool-worker*.js /var/www/kaput/chunk-lethe-pool-*.js
sudo cp /tmp/lethe-pool-build/lethe-pool-worker-wrapper.js /var/www/kaput/
sudo cp /tmp/lethe-pool-build/chunk-lethe-pool-*.js /var/www/kaput/
sudo chown caddy:caddy /var/www/kaput/lethe-pool-worker*.js /var/www/kaput/chunk-lethe-pool-*.js
sudo chmod 644 /var/www/kaput/lethe-pool-worker*.js /var/www/kaput/chunk-lethe-pool-*.js
sudo systemctl reload caddy

echo "✅ Lethe pool worker deployed"
