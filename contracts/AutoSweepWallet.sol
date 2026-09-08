// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPrivacyPool {
    function deposit(bytes32 commitment) external payable;
    function depositToken(address token, uint256 amount, bytes32 commitment) external;
}

contract AutoSweepWallet {
    address public owner;
    address public privacyPool;
    address public arbitrumBridge;
    
    // Token support
    mapping(address => bool) public supportedTokens;
    mapping(bytes32 => address) public activeDepositAddresses;
    mapping(bytes32 => bool) public usedDepositAddresses;
    
    // USDT addresses on different networks
    mapping(string => address) public usdtAddresses;
    
    event DepositReceived(address indexed token, address indexed from, uint256 amount, bytes32 depositId);
    event AddressRotated(bytes32 oldDepositId, bytes32 newDepositId, address newAddress);
    event SweptToPrivacyPool(address indexed token, uint256 amount, bytes32 depositId);
    event BridgedToArbitrum(address indexed token, uint256 amount);
    
    constructor(address _privacyPool, address _arbitrumBridge) {
        owner = msg.sender;
        privacyPool = _privacyPool;
        arbitrumBridge = _arbitrumBridge;
        
        // Add USDT addresses for different networks
        usdtAddresses["ethereum"] = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
        usdtAddresses["bsc"] = 0x55d398326f99059fF775485246999027B3197955;
        usdtAddresses["polygon"] = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F;
        usdtAddresses["arbitrum"] = 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9;
        usdtAddresses["optimism"] = 0x94b008aA00579c1307B0EF2c499aD98a8ce58e58;
        usdtAddresses["avalanche"] = 0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // Generate new deposit address
    function generateNewDepositAddress(bytes32 salt) external onlyOwner returns (address) {
        bytes32 depositId = keccak256(abi.encodePacked(salt, block.timestamp, msg.sender));
        
        // Create new deposit vault
        DepositVault vault = new DepositVault{salt: depositId}(address(this), privacyPool, arbitrumBridge);
        
        activeDepositAddresses[depositId] = address(vault);
        
        emit AddressRotated(bytes32(0), depositId, address(vault));
        return address(vault);
    }
    
    // Rotate address after deposit
    function rotateDepositAddress(bytes32 oldDepositId) external onlyOwner {
        require(activeDepositAddresses[oldDepositId] != address(0), "Address not active");
        
        // Mark old as used
        usedDepositAddresses[oldDepositId] = true;
        delete activeDepositAddresses[oldDepositId];
        
        // Generate new address
        bytes32 newSalt = keccak256(abi.encodePacked(oldDepositId, block.timestamp));
        this.generateNewDepositAddress(newSalt);
        
        emit AddressRotated(oldDepositId, newSalt, activeDepositAddresses[newSalt]);
    }
    
    // Sweep tokens to privacy pool
    function sweepToPrivacyPool(address token, bytes32 depositId) external onlyOwner {
        require(activeDepositAddresses[depositId] != address(0), "Address not active");
        
        DepositVault vault = DepositVault(payable(activeDepositAddresses[depositId]));
        uint256 balance = vault.getTokenBalance(token);
        require(balance > 0, "No balance to sweep");
        
        vault.sweepToken(token, privacyPool, balance);
        
        emit SweptToPrivacyPool(token, balance, depositId);
    }
    
    // Add supported token
    function addSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = true;
    }
}

contract DepositVault {
    address public immutable parent;
    address public immutable privacyPool;
    address public immutable arbitrumBridge;
    
    constructor(address _parent, address _privacyPool, address _arbitrumBridge) {
        parent = _parent;
        privacyPool = _privacyPool;
        arbitrumBridge = _arbitrumBridge;
    }
    
    receive() external payable {
        // Auto-sweep native tokens
        if (address(this).balance > 0) {
            _autoSweepNative();
        }
    }
    
    // Get token balance
    function getTokenBalance(address token) public view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }
    
    // Sweep token to privacy pool
    function sweepToken(address token, address destination, uint256 amount) external {
        require(msg.sender == parent, "Not parent");
        
        if (token == address(0)) {
            (bool success, ) = payable(destination).call{value: amount}("");
            require(success, "Native sweep failed");
        } else {
            require(IERC20(token).transfer(destination, amount), "Token sweep failed");
        }
    }
    
    // Auto-sweep native tokens
    function _autoSweepNative() internal {
        uint256 balance = address(this).balance;
        (bool success, ) = payable(privacyPool).call{value: balance}("");
        require(success, "Auto-sweep native failed");
    }
    
    // Auto-sweep tokens (called by anyone)
    function autoSweepToken(address token) external {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            require(IERC20(token).transfer(privacyPool, balance), "Auto-sweep token failed");
        }
    }
}
