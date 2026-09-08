const CONTRACT_ADDRESSES = {
    privacyWallet: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    privacyPool: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
};

const PRIVACY_WALLET_ABI = [
    "function generateNewDepositAddress(bytes32 salt) returns (address)",
    "function sweepToArbitrum(address depositAddress)",
    "function isDepositAddress(address) view returns (bool)",
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
    } else {
        alert('Please install MetaMask!');
    }
}

async function generateDepositAddress() {
    const salt = ethers.utils.id(Date.now().toString());
    const tx = await privacyWallet.generateNewDepositAddress(salt);
    await tx.wait();
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'NewDepositAddress');
    currentDepositAddress = event.args.newAddress;
    
    document.getElementById('depositAddress').innerHTML = 
        `Deposit Address: <strong>${currentDepositAddress}</strong>`;
}

async function deposit() {
    const amount = document.getElementById('depositAmount').value;
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
    
    setTimeout(async () => {
        await privacyWallet.sweepToArbitrum(currentDepositAddress);
    }, 5000);
    
    addToHistory(`Deposited ${amount} ETH to privacy pool`);
}

async function withdrawToArbitrum() {
    const arbitrumAddress = document.getElementById('arbitrumAddress').value;
    
    const nullifier = ethers.utils.randomBytes(32);
    const nullifierHash = ethers.utils.keccak256(nullifier);
    
    const tx = await privacyPool.withdraw(
        nullifierHash,
        arbitrumAddress,
        ethers.utils.parseEther("0.01")
    );
    
    await tx.wait();
    addToHistory(`Withdrawn to Arbitrum: ${arbitrumAddress}`);
}

function addToHistory(entry) {
    const history = document.getElementById('history');
    const div = document.createElement('div');
    div.className = 'status success';
    div.textContent = `${new Date().toLocaleTimeString()}: ${entry}`;
    history.prepend(div);
}

setInterval(checkForDeposits, 30000);

async function checkForDeposits() {
    if (provider && currentDepositAddress) {
        const balance = await provider.getBalance(currentDepositAddress);
        if (balance.gt(0)) {
            addToHistory(`Pending deposit detected: ${ethers.utils.formatEther(balance)} ETH`);
            await privacyWallet.sweepToArbitrum(currentDepositAddress);
        }
    }
}
