const hre = require("hardhat");

async function main() {
  console.log("Deploying Kaput to Testnets...");
  
  // Define networks to deploy to
  const networks = [
    { name: "arbitrumSepolia", chainId: 421614 },
    { name: "optimismSepolia", chainId: 11155420 },
    { name: "baseSepolia", chainId: 84532 },
    { name: "polygonAmoy", chainId: 80002 },
  ];
  
  for (const network of networks) {
    console.log(`\nDeploying to ${network.name}...`);
    
    // Deploy PrivacyPool
    const PrivacyPool = await hre.ethers.getContractFactory("PrivacyPool");
    const privacyPool = await PrivacyPool.deploy();
    await privacyPool.deployed();
    console.log(`PrivacyPool deployed to ${network.name}:`, privacyPool.address);
    
    // Deploy ArbitrumBridgeAdapter
    const ArbitrumBridgeAdapter = await hre.ethers.getContractFactory("ArbitrumBridgeAdapter");
    const bridgeAdapter = await ArbitrumBridgeAdapter.deploy(
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000"
    );
    await bridgeAdapter.deployed();
    console.log(`BridgeAdapter deployed to ${network.name}:`, bridgeAdapter.address);
    
    // Deploy PrivacyWallet
    const PrivacyWallet = await hre.ethers.getContractFactory("PrivacyWallet");
    const privacyWallet = await PrivacyWallet.deploy(
      bridgeAdapter.address,
      privacyPool.address
    );
    await privacyWallet.deployed();
    console.log(`PrivacyWallet deployed to ${network.name}:`, privacyWallet.address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
