const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying Kaput Privacy Wallet to Mainnet...");
  
  // Mainnet deployment addresses (update before deployment)
  const MAINNET_CONFIG = {
    ethereum: {
      arbitrumBridge: "0x0000000000000000000000000000000000000000",
      hopBridge: "0x0000000000000000000000000000000000000000"
    },
    arbitrum: {
      arbitrumBridge: "0x0000000000000000000000000000000000000000",
      hopBridge: "0x0000000000000000000000000000000000000000"
    }
  };
  
  const network = hre.network.name;
  console.log(`Deploying to ${network}...`);
  
  // Deploy PrivacyPool
  console.log("Deploying PrivacyPool...");
  const PrivacyPool = await hre.ethers.getContractFactory("PrivacyPool");
  const privacyPool = await PrivacyPool.deploy();
  await privacyPool.deployed();
  console.log(`✅ PrivacyPool deployed to: ${privacyPool.address}`);
  
  // Deploy ArbitrumBridgeAdapter
  console.log("Deploying ArbitrumBridgeAdapter...");
  const ArbitrumBridgeAdapter = await hre.ethers.getContractFactory("ArbitrumBridgeAdapter");
  const bridgeAdapter = await ArbitrumBridgeAdapter.deploy(
    MAINNET_CONFIG[network]?.arbitrumBridge || "0x0000000000000000000000000000000000000000",
    MAINNET_CONFIG[network]?.hopBridge || "0x0000000000000000000000000000000000000000"
  );
  await bridgeAdapter.deployed();
  console.log(`✅ BridgeAdapter deployed to: ${bridgeAdapter.address}`);
  
  // Deploy PrivacyWallet
  console.log("Deploying PrivacyWallet...");
  const PrivacyWallet = await hre.ethers.getContractFactory("PrivacyWallet");
  const privacyWallet = await PrivacyWallet.deploy(
    bridgeAdapter.address,
    privacyPool.address
  );
  await privacyWallet.deployed();
  console.log(`✅ PrivacyWallet deployed to: ${privacyWallet.address}`);
  
  console.log("\n🎉 Mainnet Deployment Complete!");
  console.log("=================================");
  console.log(`Network: ${network}`);
  console.log(`PrivacyWallet: ${privacyWallet.address}`);
  console.log(`PrivacyPool: ${privacyPool.address}`);
  console.log(`Bridge: ${bridgeAdapter.address}`);
  console.log("=================================");
  
  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    network: network,
    timestamp: new Date().toISOString(),
    contracts: {
      privacyWallet: privacyWallet.address,
      privacyPool: privacyPool.address,
      bridge: bridgeAdapter.address
    }
  };
  
  fs.appendFileSync('MAINNET_DEPLOYMENT.md', 
    `\n## ${network} Deployment\n` +
    `- Date: ${deploymentInfo.timestamp}\n` +
    `- PrivacyWallet: ${privacyWallet.address}\n` +
    `- PrivacyPool: ${privacyPool.address}\n` +
    `- Bridge: ${bridgeAdapter.address}\n`
  );
  
  console.log("\nDeployment info saved to MAINNET_DEPLOYMENT.md");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
