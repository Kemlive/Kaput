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

    log.push('4. Calling startRailgunEngine...');
    const startFn = Railgun.startRailgunEngine;
    if (typeof startFn !== 'function') {
      throw new Error('startRailgunEngine is not a function');
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
    log.push('   startRailgunEngine resolved');

    log.push('5. Checking hasEngine...');
    const has = Railgun.hasEngine();
    log.push('   hasEngine() = ' + has);

    if (!has) {
      throw new Error('startRailgunEngine resolved but hasEngine() is false');
    }

    log.push('✅ Engine booted');

    return { ok: true, log };
  } catch (err) {
    log.push('✗ FAILED: ' + (err?.message || err));
    return { ok: false, log, error: err?.message || String(err), stack: err?.stack };
  }
}


// ---------- Create Railgun Wallet (Stage 2) ----------

async function createWallet(mnemonic, encryptionKey) {
  const log = [];
  try {
    log.push('1. Checking createRailgunWallet export...');
    if (typeof Railgun.createRailgunWallet !== 'function') {
      throw new Error('createRailgunWallet is not a function');
    }
    log.push('   function present');

    log.push('2. Calling createRailgunWallet...');
    const info = await Railgun.createRailgunWallet(
      encryptionKey,
      mnemonic,
      {}  // creationBlockNumbers — empty map is fine for test
    );
    log.push('   resolved: ' + JSON.stringify(info));

    if (!info || !info.id || !info.railgunAddress) {
      throw new Error('createRailgunWallet returned unexpected shape: ' + JSON.stringify(info));
    }

    log.push('   walletId = ' + info.id);
    log.push('   railgunAddress = ' + info.railgunAddress);

    return { ok: true, log, walletId: info.id, railgunAddress: info.railgunAddress };
  } catch (err) {
    log.push('✗ FAILED: ' + (err?.message || err));
    return { ok: false, log, error: err?.message || String(err), stack: err?.stack };
  }
}

// ---------- Message dispatch ----------

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
    const { mnemonic, encryptionKey } = event.data || {};
    if (!mnemonic || !encryptionKey) {
      self.postMessage({ type: 'create-result', id, ok: false, error: 'mnemonic and encryptionKey required' });
      return;
    }
    self.postMessage({ type: 'create-progress', id, message: 'creating wallet' });
    const result = await createWallet(mnemonic, encryptionKey);
    self.postMessage({ type: 'create-result', id, ...result });
    return;
  }

  if (type === 'boot-engine') {
    self.postMessage({ type: 'boot-progress', id, message: 'starting' });
    const result = await bootEngine();
    self.postMessage({ type: 'boot-result', id, ...result });
    return;
  }
};

self.postMessage({
  type: 'ready',
  exportSample: Object.keys(Railgun).slice(0, 30),
});
