# Railgun Integration — Architecture

**Status:** Planning
**Target:** Lethe Stage 2 (on-chain unlinkability)
**Author:** TBD
**Last updated:** 2026-09-16

---

## 1. Why Railgun

Current Lethe delivers **metadata privacy**: senders cannot link to the
user's main wallet. But the sweep transaction itself — stealth address →
main wallet — is visible on-chain. A chain analyst can reconstruct the
full graph.

Railgun is a ZK privacy pool. Funds shielded into it become opaque
UTXOs. When the user later unshields to a fresh address, there is no
on-chain link between the shield and the unshield.

Goal: stealth → Railgun shield → [ZK pool] → Railgun unshield → fresh wallet.

---

## 2. What Railgun Requires (Facts from Their Docs)

The Railgun SDK is not a drop-in library. It has its own runtime:

| Component | Purpose | Size |
|---|---|---|
| `@railgun-community/wallet` | SDK entry | ~2 MB JS |
| `@railgun-community/engine` | UTXO scanning, merkletree | ~5 MB JS |
| `snarkjs` + Groth16 circuits | Generate proofs | ~50 MB WASM + zkey |
| `level-js` (IndexedDB) | Local wallet storage | ~200 KB |
| `@railgun-community/waku-broadcaster-client-web` | Relayer discovery | ~500 KB |
| QuickSync indexer | Chain sync | Graph Protocol |

**First sync** downloads the full merkletree commitment set (~50-100 MB
on Arbitrum today, growing). Subsequent syncs are incremental.

**Proof generation** takes 5-30 seconds in-browser. This blocks the
main thread unless run in a Web Worker.

**Ethers version**: Railgun's SDK ships with ethers v6. Lethe uses
ethers v5 in the browser (via `ethers.min.js`). **These cannot coexist
in the same module graph.**

---

## 3. Hard Constraints

### 3.1 Ethers v6 vs v5

Three options, none trivial:

| Option | Effort | Risk |
|---|---|---|
| **A: Migrate Lethe to ethers v6** | 1-2 days | Every existing feature touches ethers |
| **B: Isolate Railgun in a separate worker/iframe** | 3-5 days | Communication complexity |
| **C: Vendor two ethers versions** | Fragile | Unpredictable breakage |

**Recommendation:** Option A. The wallet is small enough that a
one-time migration is cleaner than permanent architectural workaround.

### 3.2 The 50 MB Artifact Problem

Railgun needs `.wasm` and `.zkey` files for each circuit. They're
public — downloaded once, cached forever.

Current CSP:

Where artifacts come from matters:

| Source | Pros | Cons |
|---|---|---|
| IPFS (dweb.link) | Decentralized | Slow on Tor, CORS + CSP issues |
| Self-hosted on `lethewallet.com/artifacts/` | Fast, cached | 50 MB added to VPS storage + bandwidth |
| Hybrid (both) | Resilient | More CSP entries |

**Recommendation:** Self-host on Lethe's VPS. Add `artifact.lethewallet.com`
as a subdomain (or `/artifacts/` path) with aggressive caching. Update CSP.

### 3.3 Proving Time

5-30 seconds per proof in-browser. The user sees this. Design
requirements:

- Progress UI (not just a spinner)
- Do not block the rest of the wallet during proving
- Warn users before they start

This is inherent to Groth16. No way around it short of outsourcing
proof generation to a server (which would leak the inputs — unacceptable).

---

## 4. Key Derivation

Railgun wallets are derived from a BIP39 mnemonic. Two models:

### Model A — Derive from wallet signature (same pattern as stealth keys)


**Pros:** No separate seed to store. Consistent with stealth UX.
**Cons:** If signature determinism ever breaks (hardware wallet
firmware, wallet software change), the user loses access.

### Model B — User-supplied passphrase

Generate a mnemonic, encrypt with passphrase, store in IndexedDB.

**Pros:** Independent of wallet signature.
**Cons:** Another secret. More friction.

**Recommendation:** Model A with mandatory mnemonic backup step. Same
model Fluidkey uses.

---

## 5. Proposed Architecture


### 5.1 Worker API

The worker exposes four methods via postMessage:

| Method | Input | Output |
|---|---|---|
| `init` | { mnemonic, encryptionKey, chain } | { walletId } |
| `loadWallet` | { walletId, chain } | { walletId, zkAddress } |
| `shield` | { token, amount, from } | { txHash } |
| `unshield` | { token, amount, to } | { txHash } |
| `getBalances` | { chain } | { perToken: [amounts] } |

Progress events are pushed async:
- `{ type: 'syncProgress', pct }`
- `{ type: 'provingProgress', circuit, pct }`
- `{ type: 'broadcasterSearch', status }`

### 5.2 Alternative: Iframe instead of Worker

A worker can't easily use `IndexedDB` + `OPFS` + `Waku` together
without careful setup. An iframe with its own origin could isolate
everything cleanly.

**Tradeoff:** iframe = more robust, but harder to communicate with
(parent/postMessage, CORS, CSP). Worker = simpler, but worker
limitations apply.

**Recommendation:** Worker. Test the artifact loading early — if it
fails in a worker, fall back to iframe.

---

## 6. Storage Layout

| Data | Store | Encrypted |
|---|---|---|
| Railgun wallet blob | IndexedDB (level-js) | AES-256-GCM with key derived from signature |
| UTXO merkletree | IndexedDB | No (public chain data) |
| Artifacts (WASM + zkey) | OPFS | No (public) |
| QuickSync cache | IndexedDB | No (public) |
| User's 12-word mnemonic | **Nowhere** | Shown once, user stores |

**Critical rule:** No private material at rest. Same rule as stealth.

---

## 7. UI Changes

### 7.1 New Section: Privacy Pool

Below the existing Withdraw card:


### 5.1 Worker API

The worker exposes four methods via postMessage:

| Method | Input | Output |
|---|---|---|
| `init` | { mnemonic, encryptionKey, chain } | { walletId } |
| `loadWallet` | { walletId, chain } | { walletId, zkAddress } |
| `shield` | { token, amount, from } | { txHash } |
| `unshield` | { token, amount, to } | { txHash } |
| `getBalances` | { chain } | { perToken: [amounts] } |

Progress events are pushed async:
- `{ type: 'syncProgress', pct }`
- `{ type: 'provingProgress', circuit, pct }`
- `{ type: 'broadcasterSearch', status }`

### 5.2 Alternative: Iframe instead of Worker

A worker can't easily use `IndexedDB` + `OPFS` + `Waku` together
without careful setup. An iframe with its own origin could isolate
everything cleanly.

**Tradeoff:** iframe = more robust, but harder to communicate with
(parent/postMessage, CORS, CSP). Worker = simpler, but worker
limitations apply.

**Recommendation:** Worker. Test the artifact loading early — if it
fails in a worker, fall back to iframe.

---

## 6. Storage Layout

| Data | Store | Encrypted |
|---|---|---|
| Railgun wallet blob | IndexedDB (level-js) | AES-256-GCM with key derived from signature |
| UTXO merkletree | IndexedDB | No (public chain data) |
| Artifacts (WASM + zkey) | OPFS | No (public) |
| QuickSync cache | IndexedDB | No (public) |
| User's 12-word mnemonic | **Nowhere** | Shown once, user stores |

**Critical rule:** No private material at rest. Same rule as stealth.

---

## 7. UI Changes

### 7.1 New Section: Privacy Pool

Below the existing Withdraw card:


### 7.2 Progress UI

During first sync:

During proof generation:

---

## 8. Chains

**v1: Arbitrum only.**

Reasons:
- Cheapest proof submission (~$0.10 per unshield)
- Cheapest shield (~$0.05)
- Arbitrum has EIP-7702 (future-proofing)
- Railgun's Arbitrum deployment is the most active pool

**v1.1: Add Ethereum mainnet.**

Ethereum costs 20-100x more per operation. Only makes sense if
users specifically need mainnet privacy.

---

## 9. Tokens

**v1: USDC only.**

Reasons:
- Largest pool on Arbitrum
- Standard ERC-20 (no USDT permit issues)
- Simplest fee accounting

**v1.1: Add USDT, DAI, WETH.**

Each new token introduces:
- New pool parameters
- New relayer fee tables
- New testing surface

Ship one, then expand.

---

## 10. Fee Model

Railgun has its own fee structure:
- **Shield**: 0.25% to DAO treasury
- **Unshield**: 0.25% DAO + ~0.1-0.5% relayer
- **Private transfer**: no fee (only gas)

Users pay these automatically through the SDK. Lethe adds nothing.

**Total user cost per cycle (shield + unshield) on Arbitrum:**
- Gas: ~$0.20
- DAO fee: 0.5% of amount
- Relayer fee: ~0.3% of amount

For a $100 cycle: ~$1.00 in fees. Acceptable.

---

## 11. Testing Plan

### Phase 1 — Sepolia Fork (Week 1)

Use a local fork of Arbitrum mainnet with test USDC.
- Initialize Railgun wallet from signature
- Shield 10 USDC
- Verify private balance appears
- Send privately to another Railgun address
- Unshield to a fresh destination
- Verify no on-chain link between shield address and unshield address

Pass criteria: An analyst with full chain visibility cannot correlate
the two transactions by timing, amount, or graph analysis.

### Phase 2 — Arbitrum Mainnet with $10 (Week 2)

Real USDC, small amounts.
- Same flow, real money
- Monitor wallet for issues

### Phase 3 — Public beta

Invite 5-10 users. Watch for edge cases:
- Proof failures
- Sync failures
- Relayer timeouts

---

## 12. Risks and Unknowns

### High risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Artifact loading fails on mobile | Medium | Test early on iOS Safari |
| Proof generation too slow for mobile | High | Show clear progress, allow background proof |
| Ethers v6 migration breaks existing features | Medium | Do it first, test every path |
| Railgun SDK changes break integration | Medium | Pin exact version |
| Arbitrum pool too small for meaningful privacy | High | Document pool size in UI |

### The elephant in the room: pool size

Railgun's Arbitrum pool currently holds maybe $10-50M TVL. Any
individual transaction is one of a few thousand notes. If our user
shields and unshields within the same day at the same amount, timing
analysis can defeat the ZK proof.

**This is not our bug.** It's inherent to all pool-based privacy.
We document it clearly, and users who need strong privacy wait for
larger deposits or pool growth.

### Medium risks

- Waku broadcaster discovery can be slow (10-30s)
- OPFS isn't supported in some browsers (fallback to IndexedDB)
- QuickSync indexer can lag 5-15 minutes behind chain head

### Low risks

- Railgun contract upgrade breaking the SDK
- Cloudflare blocking Waku WebSocket connections

---

## 13. Timeline (Realistic)

| Week | Task |
|---|---|
| 1 | Ethers v6 migration for existing wallet |
| 2 | Railgun engine boot in worker, artifact loading |
| 3 | Shield flow, private balance display |
| 4 | Unshield flow, Waku, relayer |
| 5 | Testnet end-to-end |
| 6 | Mainnet with $10, bug fixes |
| 7-8 | Polish, docs, honest UI copy |

**Total: 6-8 weeks for a production-quality integration.**

This is not a "next weekend" task. Anyone claiming otherwise is
underestimating the SDK.

---

## 14. Out of Scope for v1

- Cross-chain privacy (shield on one chain, unshield on another)
- Multiple Railgun wallets per user
- Self-hosted relayer
- Wallet export/import
- Mobile-native app
- Gas abstraction via paymaster
- Private DeFi (Railgun's DeFi integration)

Each of these is a valid future feature. None is required to ship
the core value: on-chain unlinkability.

---

## 15. Decision Points Before Code

Before writing any Railgun code, we need agreement on:

1. **Ethers v6 migration first, or worker isolation?**
2. **Key derivation: signature-based (Model A) or passphrase (Model B)?**
3. **Artifact hosting: self-hosted on VPS, or IPFS with fallback?**
4. **Chain: Arbitrum only, or Arbitrum + Ethereum?**
5. **Token: USDC only, or USDC + USDT + DAI?**
6. **Relayer: public Railgun relayer, or self-hosted?**
7. **Timeline: 6-8 weeks is fine, or need faster (with reduced scope)?**

Answer these seven. Then we build.
