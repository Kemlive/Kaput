// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Create2.sol";

contract PrivacyWallet is Ownable {
    event NewDepositAddress(address indexed newAddress, bytes32 salt);
    event SweepToArbitrum(uint256 amount, bytes32 indexed txHash);
    
    address public arbitrumBridge;
    address public privacyPool;
    mapping(address => bool) public isDepositAddress;
    uint256 public minSweepAmount = 0.01 ether;
    
    constructor(address _arbitrumBridge, address _privacyPool) {
        arbitrumBridge = _arbitrumBridge;
        privacyPool = _privacyPool;
    }
    
    function generateNewDepositAddress(bytes32 salt) external returns (address) {
        address newAddress = Create2.computeAddress(
            salt,
            keccak256(abi.encodePacked(type(DepositVault).creationCode))
        );
        
        DepositVault vault = new DepositVault{salt: salt}(arbitrumBridge);
        require(address(vault) == newAddress, "Address mismatch");
        isDepositAddress[newAddress] = true;
        
        emit NewDepositAddress(newAddress, salt);
        return newAddress;
    }
    
    function sweepToArbitrum(address depositAddress) external {
        require(isDepositAddress[depositAddress], "Not deposit address");
        DepositVault vault = DepositVault(payable(depositAddress));
        uint256 balance = address(vault).balance;
        require(balance >= minSweepAmount, "Below minimum sweep");
        
        vault.sweepThroughPrivacyPool(privacyPool);
        vault.bridgeToArbitrum();
        isDepositAddress[depositAddress] = false;
        
        emit SweepToArbitrum(balance, keccak256(abi.encodePacked(block.timestamp)));
    }
}

contract DepositVault {
    address public immutable arbitrumBridge;
    
    constructor(address _arbitrumBridge) {
        arbitrumBridge = _arbitrumBridge;
    }
    
    receive() external payable {
        if (address(this).balance >= 0.01 ether) {
            _autoSweep();
        }
    }
    
    function sweepThroughPrivacyPool(address privacyPool) external {
        (bool success, ) = privacyPool.call{value: address(this).balance}("");
        require(success, "Privacy pool deposit failed");
    }
    
    function bridgeToArbitrum() external {
        (bool success, ) = arbitrumBridge.call{value: address(this).balance}("");
        require(success, "Bridge failed");
    }
    
    function _autoSweep() internal {
        selfdestruct(payable(tx.origin));
    }
}
