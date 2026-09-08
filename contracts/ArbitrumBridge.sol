// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IArbitrumBridge {
    function depositToArbitrum(address recipient) external payable;
}

contract ArbitrumBridgeAdapter {
    address public arbOneBridge;
    address public hopBridge;
    
    constructor(address _arbOneBridge, address _hopBridge) {
        arbOneBridge = _arbOneBridge;
        hopBridge = _hopBridge;
    }
    
    function bridgeToArbitrum(address recipient) external payable {
        IArbitrumBridge(hopBridge).depositToArbitrum{value: msg.value}(recipient);
    }
}
