const CONTRACT_ADDRESSES = {
    privacyWallet: "0x9A676e781A523b5d0C0e43731313A708CB607508",
    privacyPool: "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0",
};

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

let provider;
let signer;
let privacyWallet;
let privacyPool;
let currentDepositAddress;

async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            
            privacyWallet = new ethers.Contract(
                CONTRACT_ADDRESSES.privacyWallet,
                PRIVACY_WALLET_ABI,
                signer
            );
            
            privacyPool = new ethers.Contract(
                CONTRACT_ADDRESSES.privacyPool,
                PRIVACY_POOL_ABI,
                signer
            );
            
            const address = await signer.getAddress();
            document.getElementById('walletAddress').innerHTML = 
                `Connected: <strong>${address}</strong>`;
            
            console.log("Connected successfully!");
        } catch (error) {
            console.error("Connection error:", error);
            alert('Error connecting: ' + error.message);
        }
    } else {
        alert('Please install MetaMask!');
    }
}

async function generateDepositAddress() {
    try {
        if (!privacyWallet) {
            alert('Please connect wallet first!');
            return;
        }
        
        const salt = ethers.utils.id(Date.now().toString());
        console.log("Generating address with salt:", salt);
        
        const tx = await privacyWallet.generateNewDepositAddress(salt);
        console.log("Transaction sent:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("Transaction confirmed:", receipt);
        
        const event = receipt.events?.find(e => e.event === 'NewDepositAddress');
        if (event) {
            currentDepositAddress = event.args.newAddress;
            document.getElementById('depositAddress').innerHTML = 
                `Deposit Address: <strong>${currentDepositAddress}</strong>`;
            console.log("New deposit address:", currentDepositAddress);
        } else {
            console.log("Events:", receipt.events);
            alert('Address generated but event not found. Check console.');
        }
    } catch (error) {
        console.error("Error generating address:", error);
        alert('Error: ' + error.message);
    }
}

async function deposit() {
    try {
        const amount = document.getElementById('depositAmount').value;
        if (!amount) {
            alert('Please enter an amount');
            return;
        }
        
        const amountWei = ethers.utils.parseEther(amount);
        
        const secret = ethers.utils.randomBytes(32);
        const nullifier = ethers.utils.randomBytes(32);
        const commitment = ethers.utils.solidityKeccak256(
            ['bytes32', 'bytes32'],
            [secret, nullifier]
        );
        
        const tx = await privacyPool.deposit(commitment, {
            value: amountWei
        });
        
        await tx.wait();
        
        addToHistory(`Deposited ${amount} ETH to privacy pool`);
    } catch (error) {
        console.error("Deposit error:", error);
        alert('Deposit error: ' + error.message);
    }
}

async function withdrawToArbitrum() {
    try {
        const arbitrumAddress = document.getElementById('arbitrumAddress').value;
        if (!arbitrumAddress) {
            alert('Please enter an Arbitrum address');
            return;
        }
        
        const nullifier = ethers.utils.randomBytes(32);
        const nullifierHash = ethers.utils.keccak256(nullifier);
        
        const tx = await privacyPool.withdraw(
            nullifierHash,
            arbitrumAddress,
            ethers.utils.parseEther("0.01")
        );
        
        await tx.wait();
        addToHistory(`Withdrawn to Arbitrum: ${arbitrumAddress}`);
    } catch (error) {
        console.error("Withdrawal error:", error);
        alert('Withdrawal error: ' + error.message);
    }
}

function addToHistory(entry) {
    const history = document.getElementById('history');
    const div = document.createElement('div');
    div.className = 'status success';
    div.textContent = `${new Date().toLocaleTimeString()}: ${entry}`;
    history.prepend(div);
}

console.log("Kaput Privacy Wallet loaded");
console.log("Contract addresses:", CONTRACT_ADDRESSES);
