// Railgun Worker — SDK loaded (Stage 0) + engine boot (Stage 1)

import * as Railgun from '@railgun-community/wallet';
import Level from 'level-js';

// ---------- OPFS-backed ArtifactStore helpers ----------

async function opfsRead(dir, fileName) {
  const root = await navigator.storage.getDirectory();
  const dirHandle = await root.getDirectoryHandle(dir, { create: false });
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
  const file = await fileHandle.getFile();
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function opfsWrite(dir, fileName, data) {
  const root = await navigator.storage.getDirectory();
  const dirHandle = await root.getDirectoryHandle(dir, { create: true });
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function opfsExists(dir, fileName) {
  try {
    const root = await navigator.storage.getDirectory();
    const dirHandle = await root.getDirectoryHandle(dir, { create: false });
    await dirHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch {
    return false;
  }
}

// ---------- State ----------

let engineDB = null;
let activeWalletId = null;
let poolRailgunAddress = null;
let poolEncryptionKey = null;

// ---------- Boot ----------

async function bootEngine() {
  const log = [];
  try {
    log.push('1. Creating Level.js DB...');
    engineDB = new Level('lethe-railgun-db');
    log.push('   DB created');

    log.push('2. Checking ArtifactStore class...');
    const AS = Railgun.ArtifactStore;
    if (typeof AS !== 'function') {
      throw new Error('ArtifactStore is not a constructor — got ' + typeof AS);
    }
    log.push('   ArtifactStore is a ' + (AS.toString().startsWith('class') ? 'class' : 'function'));

    log.push('3. Constructing ArtifactStore with OPFS handlers...');
    const artifactStore = new AS(opfsRead, opfsWrite, opfsExists);
    log.push('   ArtifactStore constructed');

    log.push('4. Starting Lethe privacy engine...');
    const startFn = Railgun.startRailgunEngine;
    if (typeof startFn !== 'function') {
      throw new Error('Lethe privacy engine is not available');
    }

    await startFn(
      'lethe',                                           // walletSource (<=16 chars, lowercase)
      engineDB,                                          // LevelDOWN DB
      false,                                             // shouldDebug
      artifactStore,                                     // ArtifactStore
      false,                                             // useNativeArtifacts
      false,                                             // skipMerkletreeScans
      ['https://ppoi-agg.horsewithsixlegs.xyz'],         // POI aggregator URLs
      []                                                 // custom POI lists
    );
    log.push('   privacy engine started');

    log.push('5. Checking hasEngine...');
    const has = Railgun.hasEngine();
    log.push('   hasEngine() = ' + has);

    if (!has) {
      throw new Error('privacy engine started but hasEngine() is false');
    }

    log.push('✅ Engine booted');

    return { ok: true, log };
  } catch (err) {
    log.push('✗ FAILED: ' + (err?.message || err));
    return { ok: false, log, error: err?.message || String(err), stack: err?.stack };
  }
}


// ---------- Create Lethe Private Wallet (Stage 2) ----------

async function createWallet(mnemonic, encryptionKey) {
  const log = [];
  try {
    log.push('1. Checking wallet creation function...');
    if (typeof Railgun.createRailgunWallet !== 'function') {
      throw new Error('Wallet creation function is not available');
    }
    log.push('   function present');

    log.push('2. Creating private wallet...');
    const info = await Railgun.createRailgunWallet(
      encryptionKey,
      mnemonic,
      {}  // creationBlockNumbers — empty map is fine for test
    );
    log.push('   resolved: ' + JSON.stringify(info));

    if (!info || !info.id || !info.railgunAddress) {
      throw new Error('Wallet creation returned unexpected shape: ' + JSON.stringify(info));
    }

    log.push('   walletId = ' + info.id);
    log.push('   railgunAddress = ' + info.railgunAddress);

    activeWalletId = info.id;
    poolRailgunAddress = info.railgunAddress;
    poolEncryptionKey = encryptionKey;
    activeWalletId = info.id;
    poolRailgunAddress = info.railgunAddress;
    poolEncryptionKey = encryptionKey;
    return { ok: true, log, walletId: info.id, railgunAddress: info.railgunAddress };
  } catch (err) {
    log.push('✗ FAILED: ' + (err?.message || err));
    return { ok: false, log, error: err?.message || String(err), stack: err?.stack };
  }
}

// ---------- Message dispatch ----------



// Any handler that needs the engine calls this first. If the engine
// hasn't been booted yet, boot it now. Safe to call repeatedly.
async function ensureEngineReady() {
  if (typeof Railgun.hasEngine === 'function' && Railgun.hasEngine()) {
    return { ok: true, log: ['engine already booted'] };
  }
  return await bootEngine();
}


// ========== SHIELD — deposit USDC into the private pool ==========
// User's own wallet signs the tx and pays gas. The Railgun contract
// creates a note that only the user's pool wallet can spend. The
// resulting note blends into the pool's anonymity set — no future
// withdrawal can be linked back to this deposit.

// ========== LOAD CHAIN — register wallet on Arbitrum ==========
// The SDK requires explicit chain loading before any proof generation,
// gas estimate, or shield/unshield call. Without this, calls fail with
// "No value found for txidVersion=null".

async function loadChain(networkName, chainId) {
  const log = [];
  try {
    if (typeof Railgun.loadProvider !== 'function') {
      throw new Error('loadProvider not available');
    }
    log.push('1. Building provider config...');
    const providerConfig = {
      chainId: chainId,
      providers: [{
        provider: self.location.origin + '/rpc?chain=' + networkName.toLowerCase(),
        priority: 1,
        weight: 2,
        stallTimeout: 10000,
        maxLogsPerBatch: 10000,
      }],
    };

    log.push('2. Registering scan callbacks...');
    if (typeof Railgun.setOnUTXOMerkletreeScanCallback === 'function') {
      Railgun.setOnUTXOMerkletreeScanCallback((scanData) => {
        self.postMessage({ type: 'scan-progress', tree: 'utxo', data: scanData });
      });
    }
    if (typeof Railgun.setOnTXIDMerkletreeScanCallback === 'function') {
      Railgun.setOnTXIDMerkletreeScanCallback((scanData) => {
        self.postMessage({ type: 'scan-progress', tree: 'txid', data: scanData });
      });
    }
    if (typeof Railgun.setOnBalanceUpdateCallback === 'function') {
      Railgun.setOnBalanceUpdateCallback((balances) => {
        self.postMessage({ type: 'balance-update', data: balances });
      });
    }

    log.push('3. Calling loadProvider...');
    const response = await Railgun.loadProvider(providerConfig, networkName, 10000);
    log.push('   fees: ' + JSON.stringify(response?.feesSerialized || {}));

    log.push('3. Starting UTXO scan...');
    try {
      await Railgun.refreshBalances({ type: 0, id: chainId }, [activeWalletId]);
    } catch (e) { log.push('   refresh: ' + (e?.message || e)); }
    log.push('4. Refreshing balances for wallet...');
    await Railgun.refreshBalances({ type: 0, id: chainId }, [activeWalletId]);

    log.push('✅ Chain loaded');
    return { ok: true, log };
  } catch (e) {
    log.push('✗ FAILED: ' + (e?.message || e));
    return { ok: false, log, error: e?.message || String(e) };
  }
}

function pad32(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  return h.padStart(64, '0');
}

async function readAllowance(tokenAddress, owner, spender) {
  const data = '0xdd62ed3e' + pad32(owner) + pad32(spender);  // allowance(address,address)
  const resp = await fetch(self.location.origin + '/rpc?chain=arbitrum', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: tokenAddress, data }, 'latest'],
    }),
  });
  const j = await resp.json();
  if (!j.result || j.result === '0x') return 0n;
  return BigInt(j.result);
}

function buildApproveTx(tokenAddress, spender, amountWei) {
  const data = '0x095ea7b3' + pad32(spender) + pad32('0x' + amountWei.toString(16));  // approve(address,uint256)
  return { to: tokenAddress, data, value: '0' };
}

async function shieldDeposit(networkName, walletAddress, tokenAddress, amountRaw) {
  if (!activeWalletId) throw new Error('Pool wallet not initialized');
  if (!poolRailgunAddress) throw new Error('Pool address missing');

  const erc20AmountRecipients = [{
    tokenAddress,
    amount: BigInt(amountRaw),
    recipientAddress: poolRailgunAddress,
  }];

  // 32-byte random shield key — sender-side, per-deposit.
  const shieldPrivateKey = Array.from(
    crypto.getRandomValues(new Uint8Array(32))
  ).map(b => b.toString(16).padStart(2, '0')).join('');

  // skipGasEstimate: gasEstimateForShield calls transferFrom internally to
  // simulate and reverts when allowance is 0 — exactly the state we're in
  // on first deposit. Use a fixed estimate here; the UI estimates real gas
  // after sending the approve tx against the correct spender.
  self.postMessage({ type: 'pool-progress', label: 'Building deposit…', pct: 50 });

  const gasDetails = {
    evmGasType: 2,
    gasEstimate: 500000n,
    maxFeePerGas: 2000000000n,
    maxPriorityFeePerGas: 100000000n,
  };

  const { transaction } = await Railgun.populateShield(
    'V2_PoseidonMerkle',
    networkName,
    shieldPrivateKey,
    erc20AmountRecipients,
    [],
    gasDetails,
  );

  const shieldTx = {
    to: transaction.to,
    data: transaction.data,
    value: transaction.value ? transaction.value.toString() : '0',
    gasLimit: transaction.gasLimit ? transaction.gasLimit.toString() : undefined,
    maxFeePerGas: transaction.maxFeePerGas ? transaction.maxFeePerGas.toString() : undefined,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas ? transaction.maxPriorityFeePerGas.toString() : undefined,
  };

  // The Railgun shield contract pulls USDC via transferFrom. Verify the
  // user has approved enough; if not, return an approve tx to send first.
  self.postMessage({ type: 'pool-progress', label: 'Checking allowance…', pct: 90 });
  const needed = BigInt(amountRaw);
  const current = await readAllowance(tokenAddress, walletAddress, shieldTx.to);
  const needsApproval = current < needed;

  self.postMessage({ type: 'pool-progress', label: 'Ready to sign', pct: 100 });

  return {
    ok: true,
    needsApproval,
    approvalTx: needsApproval ? buildApproveTx(tokenAddress, shieldTx.to, needed) : null,
    transaction: shieldTx,
  };
}

// ========== UNSHIELD (private withdrawal) ==========
// Generates a ZK proof that proves ownership of a note in the pool
// without revealing which one. The proof is submitted by the user's
// own wallet (self-funded, ~$0.10 gas on Arbitrum). Destination is any
// address the caller chooses — typically a fresh stealth address so
// the withdrawal has no on-chain link to the depositor.

async function unshieldPrivately(networkName, railgunWalletID, encryptionKey, tokenAddress, amountRaw, destinationAddress) {
  if (!railgunWalletID) throw new Error('Pool wallet not initialized');
  if (!encryptionKey) throw new Error('Encryption key missing');
  if (!destinationAddress) throw new Error('Destination address required');

  const erc20AmountRecipients = [{
    tokenAddress,
    amount: BigInt(amountRaw),
    recipientAddress: destinationAddress,
  }];

  const originalGasDetails = {
    evmGasType: 2,
    gasEstimate: 800000n,
    maxFeePerGas: 200000000n,
    maxPriorityFeePerGas: 5000000n,
  };

  self.postMessage({ type: 'pool-progress', label: 'Estimating withdrawal…', pct: 5 });

  let gasEstimate = 800000n;
  try {
    const est = await Railgun.gasEstimateForUnprovenUnshield(
      'V2_PoseidonMerkle',
      networkName,
      railgunWalletID,
      encryptionKey,
      erc20AmountRecipients,
      [],
      originalGasDetails,
      undefined,
      true,
    );
    if (est && est.gasEstimate) gasEstimate = BigInt(est.gasEstimate);
  } catch (e) {
    console.warn('[unshield] gas estimate failed, using default:', e?.message);
  }

  self.postMessage({ type: 'pool-progress', label: 'Generating ZK proof (this takes ~20s)…', pct: 15 });

  const progressCb = (p) => {
    const pct = 15 + Math.min(65, Math.round((p || 0) * 65));
    self.postMessage({ type: 'pool-progress', label: 'Generating ZK proof…', pct });
  };

  await Railgun.generateUnshieldProof(
    'V2_PoseidonMerkle',
    networkName,
    railgunWalletID,
    encryptionKey,
    erc20AmountRecipients,
    [],
    undefined,
    true,
    undefined,
    progressCb,
  );

  self.postMessage({ type: 'pool-progress', label: 'Building transaction…', pct: 85 });

  const gasDetails = {
    evmGasType: 2,
    gasEstimate,
    maxFeePerGas: 200000000n,
    maxPriorityFeePerGas: 5000000n,
  };

  const { transaction } = await Railgun.populateProvedUnshield(
    'V2_PoseidonMerkle',
    networkName,
    railgunWalletID,
    erc20AmountRecipients,
    [],
    undefined,
    true,
    undefined,
    gasDetails,
  );

  self.postMessage({ type: 'pool-progress', label: 'Ready to sign', pct: 100 });

  return {
    ok: true,
    transaction: {
      to: transaction.to,
      data: transaction.data,
      value: transaction.value ? transaction.value.toString() : '0',
      gasLimit: transaction.gasLimit ? transaction.gasLimit.toString() : gasEstimate.toString(),
    },
  };
}


// ========== POI GENERATION ==========
// Fetches Proof of Innocence proofs for shielded notes so they move
// from ShieldPending to Spendable. Signature is (networkName, walletID).

async function generatePOI(networkName) {
  if (!activeWalletId) throw new Error('Pool wallet not initialized');
  self.postMessage({ type: 'pool-progress', label: 'Fetching Proof of Innocence…', pct: 20 });
  await Railgun.generatePOIsForWallet(networkName, activeWalletId);
  self.postMessage({ type: 'pool-progress', label: 'POI complete', pct: 100 });
  return { ok: true };
}

self.onmessage = async (event) => {
  const { type, id } = event.data || {};

  if (type === 'ping') {
    self.postMessage({
      type: 'pong',
      id: id ?? null,
      sdk: {
        hasStartEngine: typeof Railgun.startRailgunEngine === 'function',
        hasCreateWallet: typeof Railgun.createRailgunWallet === 'function',
        hasProver: typeof Railgun.getProver === 'function',
        hasArtifactStore: typeof Railgun.ArtifactStore === 'function',
        hasHasEngine: typeof Railgun.hasEngine === 'function',
        hasLoadProvider: typeof Railgun.loadProvider === 'function',
        exportCount: Object.keys(Railgun).length,
      },
    });
    return;
  }

  if (type === 'create-wallet') {
    // Input:  { poolMnemonic, encryptionKey } — both pre-derived on the
    //         main thread from Lethe's internal walletClient (same signer
    //         used for stealth key derivation). No signature, no external
    //         wallet, no window.ethereum ever crosses this boundary.
    // Output: { ok, walletId, railgunAddress, log }
    const { poolMnemonic, encryptionKey } = event.data || {};

    if (!poolMnemonic || typeof poolMnemonic !== 'string') {
      self.postMessage({
        type: 'create-result', id, ok: false,
        error: 'poolMnemonic required',
      });
      return;
    }
    if (!encryptionKey || typeof encryptionKey !== 'string') {
      self.postMessage({
        type: 'create-result', id, ok: false,
        error: 'encryptionKey required',
      });
      return;
    }

    self.postMessage({ type: 'create-progress', id, message: 'ensuring engine ready' });
    const boot = await ensureEngineReady();
    if (!boot.ok) {
      self.postMessage({ type: 'create-result', id, ok: false,
        error: 'Engine boot failed: ' + (boot.error || 'unknown') });
      return;
    }

    self.postMessage({ type: 'create-progress', id, message: 'creating private wallet' });
    const result = await createWallet(poolMnemonic, encryptionKey);

    // Belt-and-braces — these never leave the worker, even if the helper
    // ever starts returning them.
    delete result.poolMnemonic;
    delete result.mnemonic;
    delete result.encryptionKey;
    delete result.signature;

    self.postMessage({ type: 'create-result', id, ...result });
    return;
  }

  if (type === 'shield') {
    try {
      const { networkName, walletAddress, tokenAddress, amountRaw } = event.data || {};
      const result = await shieldDeposit(networkName || 'Arbitrum', walletAddress, tokenAddress, amountRaw);
      self.postMessage({ type: 'shield-result', id, ...result });
    } catch (e) {
      self.postMessage({ type: 'shield-result', id, ok: false, error: e?.message || String(e) });
    }
    return;
  }

  if (type === 'load-chain') {
    const result = await loadChain(event.data.networkName || 'Arbitrum', event.data.chainId || 42161);
    self.postMessage({ type: 'load-chain-result', id, ...result });
    return;
  }

  if (type === 'rescan') {
    try {
      await Railgun.refreshBalances({ type: 0, id: 42161 }, [activeWalletId]);
      self.postMessage({ type: 'rescan-result', id, ok: true });
    } catch (e) {
      self.postMessage({ type: 'rescan-result', id, ok: false, error: e?.message || String(e) });
    }
    return;
  }

  if (type === 'unshield') {
    try {
      const { networkName, tokenAddress, amountRaw, destinationAddress } = event.data || {};
      const result = await unshieldPrivately(
        networkName || 'Arbitrum',
        activeWalletId,
        poolEncryptionKey,
        tokenAddress,
        amountRaw,
        destinationAddress,
      );
      self.postMessage({ type: 'unshield-result', id, ...result });
    } catch (e) {
      self.postMessage({ type: 'unshield-result', id, ok: false, error: e?.message || String(e) });
    }
    return;
  }

  if (type === 'generate-poi') {
    try {
      const result = await generatePOI(event.data.networkName || 'Arbitrum');
      self.postMessage({ type: 'poi-result', id, ...result });
    } catch (e) {
      self.postMessage({ type: 'poi-result', id, ok: false, error: e?.message || String(e) });
    }
    return;
  }

  if (type === 'boot-engine') {
    self.postMessage({ type: 'boot-progress', id, message: 'starting' });
    const result = await bootEngine();
    self.postMessage({ type: 'boot-result', id, ...result });
    return;
  }

  if (type === 'find-broadcaster') {
    try {
      const { tokenAddress } = event.data || {};
      if (!tokenAddress) {
        self.postMessage({ type: 'broadcaster-found', id, ok: false, error: 'tokenAddress required' });
        return;
      }
      const b = await findBroadcaster(tokenAddress);
      self.postMessage({
        type: 'broadcaster-found',
        id,
        ok: true,
        broadcaster: {
          railgunAddress: b.railgunAddress,
          tokenAddress: b.tokenAddress,
          tokenFee: b.tokenFee,
          feesID: b.feesID,
        },
      });
    } catch (e) {
      self.postMessage({ type: 'broadcaster-found', id, ok: false, error: e?.message || String(e) });
    }
    return;
  }
};

self.postMessage({
  type: 'ready',
  exportSample: Object.keys(Railgun).slice(0, 30),
});
