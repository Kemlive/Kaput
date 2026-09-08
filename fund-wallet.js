const hre = require("hardhat");

async function main() {
  const [account0] = await hre.ethers.getSigners();
  
  const wallets = [
    "0xF406bE7B8B65a5Ef0Cf3492dEE6e75d658de1222",  // Main wallet
    "0x76455ddAE58ef580B5f01BFEd395Df8D50eD3130"   // Deposit address
  ];
  
  for (const wallet of wallets) {
    console.log(`Funding ${wallet} with 100 ETH...`);
    const tx = await account0.sendTransaction({
      to: wallet,
      value: hre.ethers.parseEther("100")
    });
    await tx.wait();
    console.log(`Funded ${wallet} with 100 ETH!`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
