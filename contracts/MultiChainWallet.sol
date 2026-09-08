// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract MultiChainWallet {
    address public owner;
    mapping(address => bool) public supportedTokens;
    mapping(address => mapping(address => uint256)) public deposits;
    
    event TokenReceived(address indexed token, address indexed from, uint256 amount);
    event TokenSwept(address indexed token, address indexed to, uint256 amount);
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // Receive native tokens
    receive() external payable {
        emit TokenReceived(address(0), msg.sender, msg.value);
    }
    
    // Add supported token
    function addSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = true;
    }
    
    // Remove supported token
    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
    }
    
    // Check token balance
    function getTokenBalance(address token) public view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }
    
    // Sweep tokens to a destination
    function sweepTokens(address token, address to, uint256 amount) external onlyOwner {
        require(supportedTokens[token] || token == address(0), "Token not supported");
        
        if (token == address(0)) {
            // Native token (ETH, BNB, etc.)
            (bool success, ) = payable(to).call{value: amount}("");
            require(success, "Native token transfer failed");
        } else {
            // ERC20 token
            require(IERC20(token).transfer(to, amount), "Token transfer failed");
        }
        
        emit TokenSwept(token, to, amount);
    }
    
    // Emergency withdraw all tokens
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = getTokenBalance(token);
        require(balance > 0, "No balance");
        
        if (token == address(0)) {
            (bool success, ) = payable(owner).call{value: balance}("");
            require(success, "Emergency withdraw failed");
        } else {
            require(IERC20(token).transfer(owner, balance), "Emergency withdraw failed");
        }
    }
}
