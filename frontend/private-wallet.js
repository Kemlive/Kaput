// True Privacy Wallet - Sepolia Testnet
class KaputPrivacyWallet {
    constructor() {
        // Connect to Sepolia
        this.provider = new ethers.providers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
        this.wallet = null;
        this.hdNode = null;
        this.addressIndex = 0;
        this.depositAddresses = [];
        this.contracts = {};
    }
    
    initContracts() {
        const PRIVACY_WALLET_ABI = [
            "function generateNewDepositAddress(bytes32 salt) returns (address)",
            "function sweepToArbitrum(address depositAddress)",
            "function isDepositAddress(address) view returns (bool)",
            "event NewDepositAddress(address indexed newAddress, bytes32 salt)"
        ];
        
        const PRIVACY_POOL_ABI = [
            "function deposit(bytes32 commitment) payable",
            "function withdraw(bytes32 nullifierHash, address recipient, uint256 amount)",
        ];
        
        // Sepolia contract addresses
        this.contracts.privacyWallet = new ethers.Contract(
            '0x488dCCdE0565498fb7B7Fe8D8535CEF8FCe2Ce66',
            PRIVACY_WALLET_ABI,
            this.wallet
        );
        
        this.contracts.privacyPool = new ethers.Contract(
            '0x87ac94848DA5A6b7C8F88D65977197E8FDE12920',
            PRIVACY_POOL_ABI,
            this.wallet
        );
    }
    
    async createWallet() {
        try {
            const randomWallet = ethers.Wallet.createRandom();
            this.wallet = randomWallet.connect(this.provider);
            this.mnemonic = randomWallet.mnemonic.phrase;
            this.hdNode = ethers.utils.HDNode.fromMnemonic(this.mnemonic);
            this.initContracts();
            
            return {
                address: this.wallet.address,
                seedPhrase: this.mnemonic,
                privateKey: this.wallet.privateKey
            };
        } catch (error) {
            console.error("Wallet creation error:", error);
            throw error;
        }
    }
    
    async restoreWallet(seedPhrase) {
        try {
            const restoredWallet = ethers.Wallet.fromMnemonic(seedPhrase);
            this.wallet = restoredWallet.connect(this.provider);
            this.mnemonic = seedPhrase;
            this.hdNode = ethers.utils.HDNode.fromMnemonic(seedPhrase);
            this.initContracts();
            
            return {
                address: this.wallet.address,
                seedPhrase: seedPhrase
            };
        } catch (error) {
            console.error("Wallet restore error:", error);
            throw error;
        }
    }
    
    generateDepositAddress() {
        if (!this.hdNode) {
            throw new Error("Wallet not initialized");
        }
        
        const path = `m/44'/60'/0'/0/${this.addressIndex + 1}`;
        const childNode = this.hdNode.derivePath(path);
        const depositAddress = childNode.address;
        
        this.depositAddresses.push({
            index: this.addressIndex,
            address: depositAddress,
            path: path,
            privateKey: childNode.privateKey,
            used: false
        });
        
        this.addressIndex++;
        return depositAddress;
    }
    
    async depositToPrivacyPool(amountInEth) {
        try {
            const amountWei = ethers.utils.parseEther(amountInEth.toString());
            const secret = ethers.utils.randomBytes(32);
            const nullifier = ethers.utils.randomBytes(32);
            const commitment = ethers.utils.solidityKeccak256(
                ['bytes32', 'bytes32'],
                [secret, nullifier]
            );
            
            const tx = await this.contracts.privacyPool.deposit(commitment, {
                value: amountWei,
                gasLimit: 500000
            });
            
            const receipt = await tx.wait();
            
            return {
                txHash: receipt.transactionHash,
                commitment: commitment
            };
        } catch (error) {
            console.error("Deposit error:", error);
            throw error;
        }
    }
}

let kaputWallet = null;

async function createWallet() {
    try {
        kaputWallet = new KaputPrivacyWallet();
        const walletInfo = await kaputWallet.createWallet();
        
        document.getElementById('walletInfo').style.display = 'block';
        document.getElementById('createSection').style.display = 'none';
        document.getElementById('walletAddress').innerHTML = walletInfo.address;
        document.getElementById('seedPhrase').innerHTML = walletInfo.seedPhrase;
        document.getElementById('privateKey').innerHTML = walletInfo.privateKey;
        
        addToHistory('Wallet created on Sepolia testnet');
    } catch (error) {
        alert('Error creating wallet: ' + error.message);
    }
}

async function restoreWallet() {
    const seedPhrase = document.getElementById('restoreSeed').value;
    if (!seedPhrase) {
        alert('Please enter seed phrase');
        return;
    }
    
    try {
        kaputWallet = new KaputPrivacyWallet();
        const walletInfo = await kaputWallet.restoreWallet(seedPhrase);
        
        document.getElementById('walletInfo').style.display = 'block';
        document.getElementById('createSection').style.display = 'none';
        document.getElementById('walletAddress').innerHTML = walletInfo.address;
        
        addToHistory('Wallet restored on Sepolia');
    } catch (error) {
        alert('Error restoring wallet: ' + error.message);
    }
}

function generateDepositAddress() {
    if (!kaputWallet) {
        alert('Create wallet first');
        return;
    }
    
    const address = kaputWallet.generateDepositAddress();
    document.getElementById('depositAddress').innerHTML = address;
    addToHistory('Generated deposit address: ' + address);
}

async function deposit() {
    if (!kaputWallet) {
        alert('Create wallet first');
        return;
    }
    
    const amount = document.getElementById('amount').value;
    if (!amount) {
        alert('Enter amount');
        return;
    }
    
    try {
        const result = await kaputWallet.depositToPrivacyPool(amount);
        addToHistory(`✅ Deposited ${amount} ETH - TX: ${result.txHash.substring(0, 10)}...`);
    } catch (error) {
        addToHistory(`❌ Deposit failed: ${error.message}`);
        alert('Deposit error: ' + error.message);
    }
}

function addToHistory(entry) {
    const history = document.getElementById('history');
    const div = document.createElement('div');
    div.className = 'status success';
    div.textContent = `${new Date().toLocaleTimeString()}: ${entry}`;
    history.prepend(div);
}

console.log('Kaput Privacy Wallet - Sepolia Testnet');
console.log('Privacy Wallet:', '0x488dCCdE0565498fb7B7Fe8D8535CEF8FCe2Ce66');
console.log('Privacy Pool:', '0x87ac94848DA5A6b7C8F88D65977197E8FDE12920');
