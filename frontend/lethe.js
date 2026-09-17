// --- install fetch override before ANY module captures a reference ---
// Route ALL JSON-RPC POST requests through same-origin /rpc → Tor → PublicNode.
// This is what stops the upstream RPC from correlating IP + wallet address.
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(resource, options) {
        const urlStr = typeof resource === 'string'
            ? resource
            : (resource && resource.url ? resource.url : '');

        // Only touch JSON-RPC POSTs that aren't already going to /rpc
        if (options && typeof options.body === 'string' && !urlStr.includes('/rpc')) {
            try {
                const body = JSON.parse(options.body);
                if (body && body.jsonrpc === '2.0' && typeof body.method === 'string') {
                    // 1. Rewrite Safe prediction eth_call (from=0x0 → to, drop gasPrice)
                    if (
                        body.method === 'eth_call' &&
                        Array.isArray(body.params) &&
                        body.params[0] &&
                        body.params[0].from === '0x0000000000000000000000000000000000000000'
                    ) {
                        const call = body.params[0];
                        call.from = call.to || '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
                        delete call.gasPrice;
                        options.body = JSON.stringify(body);
                    }

                    // 2. Tag the chain so the proxy picks the right upstream
                    const chainHint =
                        urlStr.includes('arb-one') || urlStr.includes('arbitrum') ? 'arbitrum' :
                        urlStr.includes('sepolia') ? 'sepolia' :
                        'ethereum';

                    // 3. Forward through our same-origin Tor proxy
                    const proxyUrl = new URL('/rpc', window.location.origin).href;
                    const newHeaders = Object.assign({}, options.headers || {}, { 'X-Chain': chainHint });
                    return originalFetch(proxyUrl, Object.assign({}, options, { headers: newHeaders }));
                }
            } catch (e) {
                // Not JSON-RPC — passthrough
            }
        }
        return originalFetch(resource, options);
    };
})();


import './buffer-shim.js';
import { pocketFetch } from './pocket-fetch.js';
// Lethe Stealth Module — ERC-5564 compatible
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
// Tor is handled server-side via /rpc (Caddy → lethe-rpc → Tor → PublicNode)



// Global fetch override to bypass RPC rejections for Safe prediction eth_calls



// Dedicated client for Safe prediction to bypass Pocket's 405 block
const safePredictionClient = createPublicClient({
  chain: mainnet,
  transport: http('/rpc')
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

// --- Token registry for ERC-20 claims ---
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { name: 'symbol', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'string' }] },
];

// USDT's transfer() returns nothing — using the ERC20 ABI causes a decode error
const USDT_ABI = [
  ERC20_ABI[0],
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [] },
  ERC20_ABI[2],
  ERC20_ABI[3],
];

const TOKENS_BY_CHAIN = {
  1: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, abi: ERC20_ABI },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, abi: USDT_ABI },
    DAI:  { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, abi: ERC20_ABI },
  },
  42161: {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, abi: ERC20_ABI },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, abi: USDT_ABI },
    DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, abi: ERC20_ABI },
  },
  11155111: {
    // Circle's official Sepolia USDC — for testing
    USDC: { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, abi: ERC20_ABI },
    // No standard USDT on Sepolia — mint your own if testing
  },
};


let userKeys = null;
let viewingKeyNode = null;
let spendingPublicKey = null;
let viewingPublicKey = null;
// Security migration: remove any plaintext private keys from old format
(() => {
  try {
    const raw = localStorage.getItem('lethe.generatedAccounts');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.some(a => a && a.stealthPrivateKey)) {
      console.warn('[LETHE] Wiping localStorage: old format contained plaintext private keys');
      localStorage.removeItem('lethe.generatedAccounts');
    }
  } catch (e) { /* ignore */ }
})();

// Migrate legacy 'kaput.*' storage keys on first load
(() => {
  try {
    if (!localStorage.getItem('lethe.generatedAccounts') && localStorage.getItem('lethe.generatedAccounts')) {
      localStorage.setItem('lethe.generatedAccounts', localStorage.getItem('lethe.generatedAccounts'));
      localStorage.removeItem('lethe.generatedAccounts');
    }
  } catch (e) {}
})();

let generatedAccounts = (() => {
  try {
    const raw = localStorage.getItem('lethe.generatedAccounts');
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
    localStorage.setItem('lethe.generatedAccounts', JSON.stringify(sanitized));
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

export async function initStealth(walletClient, pin = '0000') {
  const address = await walletClient.getAddress();
  const { message } = generateFluidkeyMessage({ pin, address });
  const signature = await walletClient.signMessage(message);
  userKeys = generateKeysFromSignature(signature);
  viewingKeyNode = extractViewingPrivateKeyNode(userKeys.viewingPrivateKey);

  // Compressed public keys (ERC-5564 format)
  spendingPublicKey = privateKeyToCompressedPubKey(userKeys.spendingPrivateKey);
  viewingPublicKey = privateKeyToCompressedPubKey(userKeys.viewingPrivateKey);

  return { metaAddress: getMetaAddress() };
}

// ===== Lethe Privacy Pool — key derivation =====
//
// The pool wallet derives from the SAME wallet.wallet signer that
// initStealth uses. Same master seedPhrase in, deterministic 12-word
// pool mnemonic + 32-byte encryption key out.
//
// No window.ethereum, no external wallet, no MetaMask. No timestamp,
// nonce, address, or device fingerprint is mixed in. Re-derive on any
// device with the same seedPhrase → identical pool wallet.
//
// Domain separators ('lethe-pool-entropy-v1:' / 'lethe-pool-encryption-v1:')
// keep the pool seed and pool encryption key cryptographically
// independent of each other and of the stealth keys.

const POOL_SIGN_MESSAGE = 'Lethe Privacy Pool v1';

export async function derivePoolCredentials(walletClient) {
  if (!walletClient || typeof walletClient.signMessage !== 'function') {
    throw new Error('derivePoolCredentials: walletClient with signMessage required');
  }

  // Deterministic ECDSA (RFC 6979) — same key + same message = same signature.
  const signature = await walletClient.signMessage(POOL_SIGN_MESSAGE);

  const { keccak256, toUtf8Bytes, getBytes } = await import('ethers');
  const { entropyToMnemonic } = await import('@scure/bip39');
  const { wordlist } = await import('@scure/bip39/wordlists/english');

  const rootHex = keccak256(signature).slice(2);

  // entropyToMnemonic wants raw bytes, not a hex string.
  // 128-bit entropy = 12-word BIP39 phrase.
  const entropyBytes = getBytes(
    keccak256(toUtf8Bytes('lethe-pool-entropy-v1:' + rootHex)),
  ).slice(0, 16);

  const encryptionKey = keccak256(
    toUtf8Bytes('lethe-pool-encryption-v1:' + rootHex),
  ).slice(2);       // 32 bytes hex — Railgun wants a hex string here

  const poolMnemonic = entropyToMnemonic(entropyBytes, wordlist);

  return { poolMnemonic, encryptionKey };
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
    transport: '/rpc', // routes through Caddy → Node → Tor → PublicNode
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


export async function claimFunds(stealthAddress, destination, tokenSymbol = 'eth') {
  if (!stealthAddress || !destination) throw new Error('Stealth address and destination are required');
  const account = generatedAccounts.find(
    a => a.stealthAddress.toLowerCase() === stealthAddress.toLowerCase()
  );
  if (!account) throw new Error('Stealth address not found in this wallet. Was it generated here?');

  const chain = CHAIN_MAP[account.chainName];
  if (!chain) throw new Error('Unknown chain: ' + account.chainName);

  // Always route through our same-origin Tor proxy
  const proxyUrl = new URL('/rpc', window.location.origin).href;
  const transport = http(proxyUrl, {
    fetchFn: (url, opts) => fetch(url, {
      ...opts,
      headers: { ...(opts?.headers || {}), 'X-Chain': account.chainName },
    }),
  });

  const publicClient = createPublicClient({ chain: chain.viemChain, transport });
  requireUnlock();
  const { stealthPrivateKey } = generateStealthPrivateKey({
    spendingPrivateKey: userKeys.spendingPrivateKey,
    ephemeralPublicKey: account.ephemeralPublicKey,
  });
  const walletClient = createWalletClient({
    account: privateKeyToAccount(stealthPrivateKey),
    chain: chain.viemChain,
    transport,
  });

  const sym = String(tokenSymbol).toLowerCase();

  if (sym === 'eth') {
    const balance = await publicClient.getBalance({ address: account.stealthAddress });
    if (balance === 0n) throw new Error('Nothing to claim at this address');
    const gasPrice = await publicClient.getGasPrice();
    const gasLimit = 21000n;
    const gasCost = gasPrice * gasLimit;
    if (balance <= gasCost) {
      throw new Error(`Balance too low: ${formatEther(balance)} ETH cannot cover gas (${formatEther(gasCost)} ETH)`);
    }
    const value = balance - gasCost;
    const hash = await walletClient.sendTransaction({ to: destination, value, gas: gasLimit, gasPrice });
    return { hash, value, gasCost, chain: account.chainName, token: 'ETH' };
  }

  // ERC-20 path
  const registry = TOKENS_BY_CHAIN[chain.id];
  if (!registry) throw new Error('No tokens registered for chain ' + chain.id);
  const token = registry[String(tokenSymbol).toUpperCase()];
  if (!token) throw new Error(`Token ${tokenSymbol} not supported on ${account.chainName}`);

  const tokenBal = await publicClient.readContract({
    address: token.address,
    abi: token.abi,
    functionName: 'balanceOf',
    args: [account.stealthAddress],
  });
  if (tokenBal === 0n) throw new Error(`Nothing to claim: 0 ${tokenSymbol} at this address`);

  // Stealth address must hold ETH for gas — tokens alone cannot pay
  const ethBal = await publicClient.getBalance({ address: account.stealthAddress });
  const gasPrice = await publicClient.getGasPrice();
  const gasLimit = 100000n;  // USDT/USDC transfers use ~65-80k, buffer for safety
  const gasCost = gasPrice * gasLimit;
  if (ethBal < gasCost) {
    throw new Error(
      `Stealth address needs ETH for gas. Send at least ${formatEther(gasCost)} ETH to ${account.stealthAddress} first, then retry.`
    );
  }

  const hash = await walletClient.writeContract({
    address: token.address,
    abi: token.abi,
    functionName: 'transfer',
    args: [destination, tokenBal],
    gas: gasLimit,
  });

  return {
    hash,
    value: tokenBal,
    decimals: token.decimals,
    gasCost,
    chain: account.chainName,
    token: String(tokenSymbol).toUpperCase(),
  };
}





export function lockStealth() {
  userKeys = null;
  viewingKeyNode = null;
  spendingPublicKey = null;
  viewingPublicKey = null;
  console.log('[LETHE] Stealth session keys wiped');
}

export function isUnlocked() {
  return !!(userKeys && userKeys.spendingPrivateKey);
}

window.Lethe = {
  initStealth,
  derivePoolCredentials,
  getMetaAddress,
  generateNextAddress,
  getGeneratedAccounts,
  claimFunds,
  lockStealth,
  isUnlocked,
};
