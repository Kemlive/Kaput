import './buffer-shim.js';
import './buffer-shim.js';
import { pocketFetch } from './pocket-fetch.js';
// Kaput Stealth Module — ERC-5564 compatible
import {
  generateKeysFromSignature,
  extractViewingPrivateKeyNode,
  generateEphemeralPrivateKey,
  generateStealthPrivateKey,
  generateStealthAddresses,
  predictStealthSafeAddressWithClient,
  generateFluidkeyMessage,
} from '@fluidkey/stealth-account-kit';
import { privateKeyToAccount } from 'viem/accounts';
import * as secp from '@noble/secp256k1';
import { http, toHex, createPublicClient, createWalletClient, parseEther, formatEther } from 'viem';
import { mainnet, arbitrum, sepolia } from 'viem/chains';

// Custom transport that rewrites eth_call body to work around Pocket 405
import { http as viemHttp } from 'viem';
import { torFetch } from './tor-fetch.js';

const originalFetch = window.fetch;
window.fetch = async function(resource, options) {
    if (options && options.body && typeof options.body === 'string') {
        try {
            const body = JSON.parse(options.body);
            if (body.method === 'eth_call' && body.params && body.params[0]) {
                const call = body.params[0];
                if (call.from === '0x0000000000000000000000000000000000000000') {
                    call.from = call.to || '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
                    delete call.gasPrice;
                    options.body = JSON.stringify(body);

                    const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
                    if (urlStr.includes('llamarpc') || urlStr.includes('pocket') || urlStr.includes('eth.')) {
                        return torFetch('https://ethereum-rpc.publicnode.com', options);
                    }
                }
            }
        } catch(e) {
            // Ignore non-JSON bodies
        }
    }
    return originalFetch(resource, options);
};


// Global fetch override to bypass RPC rejections for Safe prediction eth_calls



// Dedicated client for Safe prediction to bypass Pocket's 405 block
const safePredictionClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com', { fetchFn: torFetch })
});


function pocketTransport(rpcUrl) {
  const inner = viemHttp(rpcUrl);
  return (config) => {
    const transport = inner(config);
    const originalRequest = transport.request;
    return {
      ...transport,
      async request(args) {
        // Rewrite the body if it's an eth_call with from:0x0
        if (args?.method === 'eth_call' && args?.params?.[0]) {
          const call = args.params[0];
          if (call.from === '0x0000000000000000000000000000000000000000') {
            call.from = call.to || '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
          }
          if (call.gasPrice === '0x0') {
            delete call.gasPrice;
          }
          console.log('[POCKET TRANSPORT] Rewrote eth_call:', JSON.stringify(call).slice(0, 100));
        }
        return originalRequest(args);
      },
    };
  };
}


const SAFE_VERSION = '1.3.0';
const USE_DEFAULT_ADDRESS = true;
const THRESHOLD = 1;

const CHAIN_MAP = {
  ethereum: { id: 1, viemChain: mainnet, rpc: 'https://eth.api.pocket.network' },
  arbitrum: { id: 42161, viemChain: arbitrum, rpc: 'https://arb-one.api.pocket.network' },
  sepolia: { id: 11155111, viemChain: sepolia, rpc: 'https://ethereum-sepolia-rpc.publicnode.com' },
};

let userKeys = null;
let viewingKeyNode = null;
let spendingPublicKey = null;
let viewingPublicKey = null;
// Security migration: remove any plaintext private keys from old format
(() => {
  try {
    const raw = localStorage.getItem('kaput.generatedAccounts');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.some(a => a && a.stealthPrivateKey)) {
      console.warn('[SECURITY] Wiping localStorage: old format contained plaintext private keys');
      localStorage.removeItem('kaput.generatedAccounts');
    }
  } catch (e) { /* ignore */ }
})();

let generatedAccounts = (() => {
  try {
    const raw = localStorage.getItem('kaput.generatedAccounts');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
})();

function persistAccounts() {
  try {
    // Only public data is stored — no private keys, ever.
    const sanitized = generatedAccounts.map(a => ({
      nonce: a.nonce,
      stealthAddress: a.stealthAddress,
      stealthSafeAddress: a.stealthSafeAddress,
      ephemeralPublicKey: a.ephemeralPublicKey,
      chainId: a.chainId,
      chainName: a.chainName,
    }));
    localStorage.setItem('kaput.generatedAccounts', JSON.stringify(sanitized));
  } catch (e) {
    console.warn('Failed to persist accounts:', e);
  }
}

function requireUnlock() {
  if (!userKeys?.spendingPrivateKey) {
    throw new Error('Wallet locked. Please sign in to unlock stealth addresses.');
  }
}


// Convert a hex private key → compressed public key (33 bytes, 0x02/0x03 prefix)
function privateKeyToCompressedPubKey(privKey) {
  const priv = privKey.startsWith('0x') ? privKey.slice(2) : privKey;
  const pub = secp.getPublicKey(priv, true); // true = compressed
  return toHex(pub);
}

export async function initStealth(kaputWallet, pin = '0000') {
  const address = await kaputWallet.getAddress();
  const { message } = generateFluidkeyMessage({ pin, address });
  const signature = await kaputWallet.signMessage(message);
  userKeys = generateKeysFromSignature(signature);
  viewingKeyNode = extractViewingPrivateKeyNode(userKeys.viewingPrivateKey);

  // Compressed public keys (ERC-5564 format)
  spendingPublicKey = privateKeyToCompressedPubKey(userKeys.spendingPrivateKey);
  viewingPublicKey = privateKeyToCompressedPubKey(userKeys.viewingPrivateKey);

  return { metaAddress: getMetaAddress() };
}

export function getMetaAddress() {
  if (!spendingPublicKey || !viewingPublicKey) throw new Error('Stealth not initialized');
  // ERC-5564 format: st:eth:<compressedSpendingPub><compressedViewingPub>
  return 'st:eth:' + spendingPublicKey.slice(2) + viewingPublicKey.slice(2);
}

export async function generateNextAddress(chainName = 'ethereum') {
  if (!viewingKeyNode) throw new Error('Stealth not initialized');
  const chain = CHAIN_MAP[chainName];
  if (!chain) throw new Error('Unknown chain: ' + chainName);

  const nonce = BigInt(generatedAccounts.length);

  const { ephemeralPrivateKey } = generateEphemeralPrivateKey({
    viewingPrivateKeyNode: viewingKeyNode,
    nonce,
    chainId: chain.id,
  });

  // Sender-side: generate stealth address from OUR spending pub key
  const { stealthAddresses } = generateStealthAddresses({
    spendingPublicKeys: [spendingPublicKey],
    ephemeralPrivateKey,
  });

  const stealthAddress = stealthAddresses[0];
  const ephemeralAccount = privateKeyToAccount(ephemeralPrivateKey);

  // Predict the Safe
  const { stealthSafeAddress } = await predictStealthSafeAddressWithClient({
    threshold: THRESHOLD,
    stealthAddresses: [stealthAddress],
    chainId: chain.id,
    // Pocket blocks eth_call to Safe Factory — route this call through a public node
    client: safePredictionClient,
    useDefaultAddress: USE_DEFAULT_ADDRESS,
    safeVersion: SAFE_VERSION,
  });

  // Note: stealthPrivateKey is NOT derived here — it's only derived on-demand
  // during claim. This keeps no private key material at rest.
  const account = {
    nonce: Number(nonce),
    stealthAddress,
    stealthSafeAddress,
    ephemeralPublicKey: ephemeralAccount.publicKey,
    chainId: chain.id,
    chainName,
  };

  generatedAccounts.push(account);
  persistAccounts();
  return account;
}

export function getGeneratedAccounts() {
  return generatedAccounts;
}


export async function claimFunds(stealthAddress, destination) {
  if (!stealthAddress || !destination) throw new Error('Stealth address and destination are required');
  const account = generatedAccounts.find(
    a => a.stealthAddress.toLowerCase() === stealthAddress.toLowerCase()
  );
  if (!account) throw new Error('Stealth address not found in this wallet. Was it generated here?');

  const chain = CHAIN_MAP[account.chainName];
  if (!chain) throw new Error('Unknown chain: ' + account.chainName);

  // Use PublicNode for signing flows to avoid Pocket's 405
  const rpcUrl = account.chainName === 'sepolia'
    ? 'https://ethereum-sepolia-rpc.publicnode.com'
    : chain.rpc;

  const publicClient = createPublicClient({
    chain: chain.viemChain,
    transport: http(rpcUrl),
  });

  const balance = await publicClient.getBalance({ address: account.stealthAddress });
  if (balance === 0n) throw new Error('Nothing to claim at this address');

  // Estimate gas for a plain ETH transfer
  const gasPrice = await publicClient.getGasPrice();
  const gasLimit = 21000n;
  const gasCost = gasPrice * gasLimit;

  if (balance <= gasCost) {
    throw new Error(`Balance too low: ${formatEther(balance)} ETH cannot cover gas (${formatEther(gasCost)} ETH)`);
  }

  const value = balance - gasCost;

  // Derive private key on-demand from session keys + public ephemeral key
  requireUnlock();
  const { stealthPrivateKey } = generateStealthPrivateKey({
    spendingPrivateKey: userKeys.spendingPrivateKey,
    ephemeralPublicKey: account.ephemeralPublicKey,
  });

  const walletClient = createWalletClient({
    account: privateKeyToAccount(stealthPrivateKey),
    chain: chain.viemChain,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.sendTransaction({
    to: destination,
    value,
    gas: gasLimit,
    gasPrice,
  });

  return { hash, value, gasCost, chain: account.chainName };
}

window.KaputStealth = {
  initStealth,
  getMetaAddress,
  generateNextAddress,
  getGeneratedAccounts,
  claimFunds,
};
