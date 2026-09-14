// Kaput Stealth Module — uses Kaput's own wallet, no MetaMask
import {
  generateKeysFromSignature,
  extractViewingPrivateKeyNode,
  generateEphemeralPrivateKey,
  generateStealthPrivateKey,
  predictStealthSafeAddressWithClient,
  generateFluidkeyMessage,
} from '@fluidkey/stealth-account-kit';
import { privateKeyToAccount } from 'viem/accounts';

const CHAIN_ID = 0;
const SAFE_VERSION = '1.3.0';
const USE_DEFAULT_ADDRESS = true;
const THRESHOLD = 1;

let userKeys = null;
let viewingKeyNode = null;
let spendingPublicKey = null;
let viewingPublicKey = null;
let generatedAccounts = [];

export async function initStealth(kaputWallet, pin = '0000') {
  const address = await kaputWallet.getAddress();

  // 1. Generate deterministic Fluidkey message
  const { message } = generateFluidkeyMessage({ pin, address });

  // 2. Kaput's own wallet signs it — no external popup
  const signature = await kaputWallet.signMessage(message);

  // 3. Derive spending + viewing keys
  userKeys = generateKeysFromSignature(signature);

  // 4. Extract viewing key node — POSITIONAL ARG (not object!)
  viewingKeyNode = extractViewingPrivateKeyNode(userKeys.viewingPrivateKey);

  // 5. Derive public keys from private keys (viem style)
  const spendingAccount = privateKeyToAccount(userKeys.spendingPrivateKey);
  const viewingAccount = privateKeyToAccount(userKeys.viewingPrivateKey);
  spendingPublicKey = spendingAccount.publicKey;
  viewingPublicKey = viewingAccount.publicKey;

  return { metaAddress: getMetaAddress() };
}

export function getMetaAddress() {
  if (!spendingPublicKey || !viewingPublicKey) throw new Error('Stealth not initialized');
  return 'st:eth:' + spendingPublicKey + viewingPublicKey.slice(2);
}

export async function generateNextAddress(transport) {
  if (!viewingKeyNode) throw new Error('Stealth not initialized');

  const nonce = BigInt(generatedAccounts.length);

  // generateEphemeralPrivateKey: takes object with viewingPrivateKeyNode
  const { ephemeralPrivateKey } = generateEphemeralPrivateKey({
    viewingPrivateKeyNode: viewingKeyNode,
    nonce,
    chainId: CHAIN_ID,
  });

  // Derive stealth address from ephemeral private key
  const ephemeralAccount = privateKeyToAccount(ephemeralPrivateKey);
  const stealthAddress = ephemeralAccount.address;

  // Predict the Safe
  const { stealthSafeAddress } = await predictStealthSafeAddressWithClient({
    threshold: THRESHOLD,
    stealthAddresses: [stealthAddress],
    chainId: CHAIN_ID,
    transport,
    useDefaultAddress: USE_DEFAULT_ADDRESS,
    safeVersion: SAFE_VERSION,
  });

  // generateStealthPrivateKey takes { spendingPrivateKey, ephemeralPublicKey }
  const { stealthPrivateKey } = generateStealthPrivateKey({
    spendingPrivateKey: userKeys.spendingPrivateKey,
    ephemeralPublicKey: ephemeralAccount.publicKey,
  });

  const account = {
    nonce: Number(nonce),
    stealthAddress,
    stealthSafeAddress,
    stealthPrivateKey,
    chainId: CHAIN_ID,
  };

  generatedAccounts.push(account);
  return account;
}

export function getGeneratedAccounts() {
  return generatedAccounts;
}

window.KaputStealth = {
  initStealth,
  getMetaAddress,
  generateNextAddress,
  getGeneratedAccounts,
};
