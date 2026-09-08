# Why Address Generators Are Being Traced

## Current Vulnerabilities:

### 1. HD Wallet Pattern Detection
- BIP32/BIP44 derivation paths are predictable
- Analytics can group addresses from same HD wallet
- Pattern: m/44'/60'/0'/0/0, m/44'/60'/0'/0/1, etc.

### 2. Funding Pattern Analysis
- Addresses funded from same source are linked
- Similar amounts = same owner
- Similar timing = same owner

### 3. Gas Payment Tracing
- If same wallet pays gas for multiple addresses
- They're all linked to that wallet
- Analytics follows the gas trail

### 4. Contract Creation Patterns
- CREATE2 addresses can be predicted
- Same factory contract = linked addresses
- Analytics monitors factory contracts

### 5. On-chain Behavior Clustering
- Similar transaction patterns
- Same DEX interactions
- Same timing intervals
