// ============================================
// KAPUT AUTO-SWEEP ENGINE (REAL)
// Detects deposits and sweeps them automatically
// ============================================

class AutoSweepEngine {
    constructor(wallet) {
        this.wallet = wallet;
        this.monitoring = false;
        this.interval = null;
        this.pollFrequency = 8000;
        this.minSweepEth = 0.005;
        this.minSweepToken = 1;
        this.detectedDeposits = new Map();
        this.onDepositDetected = null;
        this.onSweepComplete = null;
        this.onSweepFailed = null;
    }

    start() {
        if (this.monitoring) return;
        this.monitoring = true;
        console.log('Auto-sweep engine started');
        this.checkAllDeposits();
        this.interval = setInterval(() => this.checkAllDeposits(), this.pollFrequency);
    }

    stop() {
        this.monitoring = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async checkAllDeposits() {
        if (!this.wallet.wallet || !this.wallet.provider) return;
        if (this.wallet.depositAddresses.length === 0) return;

        for (const dep of this.wallet.depositAddresses) {
            if (dep.used) continue;
            try {
                const ethBal = await this.wallet.provider.getBalance(dep.address);
                const ethAmount = parseFloat(ethers.utils.formatEther(ethBal));
                if (ethAmount >= this.minSweepEth) {
                    await this.handleDeposit(dep, 'ETH', ethAmount);
                }

                const daiAmount = await this.getTokenBalance(
                    '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, dep.address);
                if (daiAmount >= this.minSweepToken) {
                    await this.handleDeposit(dep, 'DAI', daiAmount);
                }

                const usdcAmount = await this.getTokenBalance(
                    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, dep.address);
                if (usdcAmount >= this.minSweepToken) {
                    await this.handleDeposit(dep, 'USDC', usdcAmount);
                }
            } catch (e) {
                console.error('Check failed:', e.message);
            }
        }
    }

    async getTokenBalance(tokenAddress, decimals, address) {
        try {
            const contract = new ethers.Contract(
                tokenAddress,
                ['function balanceOf(address) view returns (uint256)'],
                this.wallet.provider
            );
            const bal = await contract.balanceOf(address);
            return parseFloat(ethers.utils.formatUnits(bal, decimals));
        } catch (e) {
            return 0;
        }
    }

    async handleDeposit(deposit, symbol, amount) {
        const key = deposit.address + ':' + symbol;
        if (this.detectedDeposits.has(key)) return;
        this.detectedDeposits.set(key, { token: symbol, amount, timestamp: Date.now() });
        if (this.onDepositDetected) {
            this.onDepositDetected(deposit.address, symbol, amount);
        }
        await this.sweepDeposit(deposit, symbol, amount);
    }

    async sweepDeposit(deposit, symbol, amount) {
        try {
            const depositWallet = new ethers.Wallet(deposit.privateKey, this.wallet.provider);
            const destination = this.wallet.wallet.address;
            let tx;

            if (symbol === 'ETH') {
                const bal = await this.wallet.provider.getBalance(deposit.address);
                const gasPrice = await this.wallet.provider.getGasPrice();
                const gasLimit = ethers.BigNumber.from(21000);
                const gasCost = gasPrice.mul(gasLimit);
                const sweepAmount = bal.sub(gasCost);
                if (sweepAmount.lte(0)) return;
                tx = await depositWallet.sendTransaction({
                    to: destination,
                    value: sweepAmount,
                    gasLimit: gasLimit,
                    gasPrice: gasPrice
                });
            } else {
                const tokenAddr = symbol === 'DAI'
                    ? '0x6B175474E89094C44Da98b954EedeAC495271d0F'
                    : '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
                const decimals = symbol === 'USDC' ? 6 : 18;
                const contract = new ethers.Contract(
                    tokenAddr,
                    [
                        'function transfer(address to, uint256 amount) returns (bool)',
                        'function balanceOf(address) view returns (uint256)'
                    ],
                    depositWallet
                );
                const rawBal = await contract.balanceOf(deposit.address);
                if (rawBal.eq(0)) return;

                const ethBal = await this.wallet.provider.getBalance(deposit.address);
                if (ethBal.lt(ethers.utils.parseEther('0.001'))) {
                    if (this.onSweepFailed) {
                        this.onSweepFailed(deposit.address, symbol, 'No ETH for gas');
                    }
                    return;
                }
                tx = await contract.transfer(destination, rawBal);
            }

            const receipt = await tx.wait();
            deposit.used = true;
            this.detectedDeposits.delete(deposit.address + ':' + symbol);
            if (this.onSweepComplete) {
                this.onSweepComplete(deposit.address, symbol, amount, receipt.transactionHash);
            }
        } catch (e) {
            console.error('Sweep failed:', e.message);
            if (this.onSweepFailed) {
                this.onSweepFailed(deposit.address, symbol, e.message);
            }
        }
    }
}
