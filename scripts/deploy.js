const hre = require("hardhat");

async function main() {
  console.log("Deploying Kaput Privacy Wallet...");

  const PrivacyPool = await hre.ethers.getContractFactory("PrivacyPool");
  const privacyPool = await PrivacyPool.deploy();
  await privacyPool.deployed();
  console.log("PrivacyPool deployed to:", privacyPool.address);

  const ArbitrumBridgeAdapter = await hre.ethers.getContractFactory("ArbitrumBridgeAdapter");
  const bridgeAdapter = await ArbitrumBridgeAdapter.deploy(
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000"
  );
  await bridgeAdapter.deployed();
  console.log("BridgeAdapter deployed to:", bridgeAdapter.address);

  const PrivacyWallet = await hre.ethers.getContractFactory("PrivacyWallet");
  const privacyWallet = await PrivacyWallet.deploy(
    bridgeAdapter.address,
    privacyPool.address
  );
  await privacyWallet.deployed();
  console.log("PrivacyWallet deployed to:", privacyWallet.address);

  const salt = hre.ethers.utils.id("first-deposit");
  const tx = await privacyWallet.generateNewDepositAddress(salt);
  await tx.wait();
  console.log("Generated first deposit address with salt:", salt);

  console.log("\nDeployment complete");
  console.log("-----------------------------------");
  console.log("Privacy Wallet:", privacyWallet.address);
  console.log("Privacy Pool:", privacyPool.address);
  console.log("Bridge:", bridgeAdapter.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
