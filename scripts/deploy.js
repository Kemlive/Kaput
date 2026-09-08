const hre = require("hardhat");

async function main() {
  console.log("Deploying Kaput Privacy Wallet...");

  const PrivacyPool = await hre.ethers.getContractFactory("PrivacyPool");
  const privacyPool = await PrivacyPool.deploy();
  await privacyPool.waitForDeployment();
  const privacyPoolAddress = await privacyPool.getAddress();
  console.log("PrivacyPool deployed to:", privacyPoolAddress);

  const ArbitrumBridgeAdapter = await hre.ethers.getContractFactory("ArbitrumBridgeAdapter");
  const bridgeAdapter = await ArbitrumBridgeAdapter.deploy(
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000"
  );
  await bridgeAdapter.waitForDeployment();
  const bridgeAdapterAddress = await bridgeAdapter.getAddress();
  console.log("BridgeAdapter deployed to:", bridgeAdapterAddress);

  const PrivacyWallet = await hre.ethers.getContractFactory("PrivacyWallet");
  const privacyWallet = await PrivacyWallet.deploy(
    bridgeAdapterAddress,
    privacyPoolAddress
  );
  await privacyWallet.waitForDeployment();
  const privacyWalletAddress = await privacyWallet.getAddress();
  console.log("PrivacyWallet deployed to:", privacyWalletAddress);

  console.log("\nDeployment complete!");
  console.log("-----------------------------------");
  console.log("Privacy Wallet:", privacyWalletAddress);
  console.log("Privacy Pool:", privacyPoolAddress);
  console.log("Bridge:", bridgeAdapterAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
