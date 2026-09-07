// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PrivacyPool {
    bytes32 public merkleRoot;
    mapping(bytes32 => bool) public nullifierHashes;
    
    function deposit(bytes32 commitment) external payable {
        require(msg.value > 0, "Zero deposit");
        _insertCommitment(commitment);
    }
    
    function withdraw(
        bytes32 nullifierHash,
        address payable recipient,
        uint256 amount
    ) external {
        require(!nullifierHashes[nullifierHash], "Already spent");
        nullifierHashes[nullifierHash] = true;
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");
    }
    
    function _insertCommitment(bytes32 commitment) internal {
        merkleRoot = keccak256(abi.encodePacked(merkleRoot, commitment));
    }
}
