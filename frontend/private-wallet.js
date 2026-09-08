// True Privacy Wallet - No MetaMask Required
class KaputPrivacyWallet {
    constructor() {
        this.provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
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
        
        this.contracts.privacyWallet = new ethers.Contract(
            '0x9A676e781A523b5d0C0e43731313A708CB607508',
            PRIVACY_WALLET_ABI,
            this.wallet
        );
        
        this.contracts.privacyPool = new ethers.Contract(
            '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
            PRIVACY_POOL_ABI,
            this.wallet
        );
    }
    
    async createWallet() {
        try {
            // Generate random wallet
            const randomWallet = ethers.Wallet.createRandom();
            this.wallet = randomWallet.connect(this.provider);
            
            // Store mnemonic for HD derivation
            this.mnemonic = randomWallet.mnemonic.phrase;
            
            // Create HD node from mnemonic
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
        
        // Derive a DIFFERENT address from the HD wallet
        const path = `m/44'/60'/0'/0/${this.addressIndex + 1}`; // +1 to skip main wallet
        const childNode = this.hdNode.derivePath(path);
        const depositAddress = childNode.address;
        
        console.log("Generated deposit address:", depositAddress, "at path:", path);
        
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
    
    async getBalance(address) {
        return await this.provider.getBalance(address);
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
            
            console.log("Depositing", amountInEth, "ETH to privacy pool...");
            
            const tx = await this.contracts.privacyPool.deposit(commitment, {
                value: amountWei,
                gasLimit: 500000
            });
            
            console.log("Transaction sent:", tx.hash);
            const receipt = await tx.wait();
            console.log("Transaction confirmed:", receipt.transactionHash);
            
            return {
                txHash: receipt.transactionHash,
                commitment: commitment,
                secret: secret,
                nullifier: nullifier
            };
        } catch (error) {
            console.error("Deposit error:", error);
            throw error;
        }
    }
    
    async sweepDepositAddress(depositAddress) {
        try {
            const depositInfo = this.depositAddresses.find(d => d.address === depositAddress);
            if (!depositInfo) {
                throw new Error("Deposit address not found");
            }
            
            // Create wallet from the deposit address's private key
            const depositWallet = new ethers.Wallet(depositInfo.privateKey, this.provider);
            
            const balance = await this.provider.getBalance(depositAddress);
            console.log("Balance at", depositAddress, ":", ethers.utils.formatEther(balance), "ETH");
            
            if (balance.isZero()) {
                return { status: 'empty', balance: '0' };
            }
            
            // Send to privacy pool
            const tx = await depositWallet.sendTransaction({
                to: '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
                value: balance,
                gasLimit: 21000
            });
            
            console.log("Sweep transaction:", tx.hash);
            const receipt = await tx.wait();
            console.log("Sweep confirmed:", receipt.transactionHash);
            
            depositInfo.used = true;
            
            return {
                status: 'swept',
                txHash: receipt.transactionHash,
                amount: ethers.utils.formatEther(balance)
            };
        } catch (error) {
            console.error("Sweep error:", error);
            throw error;
        }
    }
    
    async monitorDeposits(callback) {
        for (const dep of this.depositAddresses) {
            if (!dep.used) {
                const balance = await this.provider.getBalance(dep.address);
                if (!balance.isZero()) {
                    callback(dep.address, ethers.utils.formatEther(balance));
                }
            }
        }
    }
    
    async withdrawToArbitrum(arbitrumAddress, amountInEth) {
        try {
            const nullifier = ethers.utils.randomBytes(32);
            const nullifierHash = ethers.utils.keccak256(nullifier);
            const amountWei = ethers.utils.parseEther(amountInEth.toString());
            
            const tx = await this.contracts.privacyPool.withdraw(
                nullifierHash,
                arbitrumAddress,
                amountWei,
                { gasLimit: 500000 }
            );
            
            const receipt = await tx.wait();
            
            return {
                txHash: receipt.transactionHash,
                nullifier: nullifier
            };
        } catch (error) {
            console.error("Withdrawal error:", error);
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
        
        addToHistory('Wallet created successfully');
        console.log("Wallet created:", walletInfo.address);
    } catch (error) {
        alert('Error creating wallet: ' + error.message);
        console.error(error);
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
        
        addToHistory('Wallet restored successfully');
    } catch (error) {
        alert('Error restoring wallet: ' + error.message);
        console.error(error);
    }
}

function generateDepositAddress() {
    if (!kaputWallet) {
        alert('Create wallet first');
        return;
    }
    
    try {
        const address = kaputWallet.generateDepositAddress();
        document.getElementById('depositAddress').innerHTML = address;
        addToHistory('Generated deposit address: ' + address);
        console.log("New deposit address:", address);
    } catch (error) {
        alert('Error generating address: ' + error.message);
        console.error(error);
    }
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
        addToHistory(`Depositing ${amount} ETH...`);
        const result = await kaputWallet.depositToPrivacyPool(amount);
        addToHistory(`✅ Deposited ${amount} ETH - TX: ${result.txHash.substring(0, 10)}...`);
    } catch (error) {
        addToHistory(`❌ Deposit failed: ${error.message}`);
        alert('Deposit error: ' + error.message);
        console.error(error);
    }
}

async function sweepDeposits() {
    if (!kaputWallet) {
        alert('Create wallet first');
        return;
    }
    
    addToHistory('Sweeping deposits...');
    
    for (const dep of kaputWallet.depositAddresses) {
        if (!dep.used) {
            try {
                const result = await kaputWallet.sweepDepositAddress(dep.address);
                if (result.status === 'swept') {
                    addToHistory(`✅ Swept ${result.amount} ETH from ${dep.address.substring(0, 10)}...`);
                } else if (result.status === 'empty') {
                    addToHistory(`Empty: ${dep.address.substring(0, 10)}...`);
                }
            } catch (error) {
                console.error('Sweep error for', dep.address, error);
                addToHistory(`❌ Sweep failed: ${error.message}`);
            }
        }
    }
}

function addToHistory(entry) {
    const history = document.getElementById('history');
    const div = document.createElement('div');
    div.className = 'status success';
    div.textContent = `${new Date().toLocaleTimeString()}: ${entry}`;
    history.prepend(div);
}

// Auto-monitor for deposits
setInterval(async () => {
    if (kaputWallet && kaputWallet.depositAddresses.length > 0) {
        await kaputWallet.monitorDeposits((address, balance) => {
            addToHistory(`Detected ${balance} ETH at ${address.substring(0, 10)}...`);
            // Auto-sweep
            kaputWallet.sweepDepositAddress(address).then(result => {
                if (result.status === 'swept') {
                    addToHistory(`✅ Auto-swept ${result.amount} ETH`);
                }
            });
        });
    }
}, 15000);

console.log('Kaput Privacy Wallet loaded - No MetaMask required');
