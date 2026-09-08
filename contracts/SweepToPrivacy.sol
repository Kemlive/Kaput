// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IUniswapRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

contract SweepToPrivacy {
    address public owner;
    address public privacyPool;
    
    // Withdrawal tokens (only these 2)
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    
    // DEX router for swapping
    address public uniswapRouter;
    
    // Events
    event TokenDetected(address indexed token, uint256 amount);
    event SwappedToDAI(uint256 amountIn, uint256 amountOut);
    event SwappedToUSDC(uint256 amountIn, uint256 amountOut);
    event SweptToPrivacyPool(address indexed token, uint256 amount);
    
    constructor(address _privacyPool, address _uniswapRouter) {
        owner = msg.sender;
        privacyPool = _privacyPool;
        uniswapRouter = _uniswapRouter;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // Detect incoming token and auto-sweep to DAI/USDC
    function detectAndSweep(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to sweep");
        
        emit TokenDetected(token, balance);
        
        // If token is not DAI or USDC, swap it
        if (token != DAI && token != USDC) {
            _swapToPrivacyToken(token, balance);
        } else {
            // Directly send to privacy pool
            IERC20(token).transfer(privacyPool, balance);
            emit SweptToPrivacyPool(token, balance);
        }
    }
    
    // Swap any token to DAI or USDC
    function _swapToPrivacyToken(address token, uint256 amount) internal {
        // Approve router
        IERC20(token).approve(uniswapRouter, amount);
        
        // Swap path: token -> WETH -> DAI (or USDC)
        address[] memory path = new address[](3);
        path[0] = token;
        path[1] = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2; // WETH
        path[2] = DAI; // Default to DAI
        
        uint256 deadline = block.timestamp + 300; // 5 minutes
        
        uint256[] memory amounts = IUniswapRouter(uniswapRouter).swapExactTokensForTokens(
            amount,
            0, // Accept any amount
            path,
            address(this),
            deadline
        );
        
        emit SwappedToDAI(amount, amounts[amounts.length - 1]);
        
        // Send swapped DAI to privacy pool
        uint256 daiBalance = IERC20(DAI).balanceOf(address(this));
        IERC20(DAI).transfer(privacyPool, daiBalance);
        
        emit SweptToPrivacyPool(DAI, daiBalance);
    }
    
    // Withdraw only DAI or USDC
    function withdrawPrivacyToken(address token, uint256 amount) external onlyOwner {
        require(token == DAI || token == USDC, "Only DAI or USDC withdrawal");
        require(IERC20(token).balanceOf(address(this)) >= amount, "Insufficient balance");
        
        IERC20(token).transfer(msg.sender, amount);
    }
    
    // Emergency withdraw
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance");
        IERC20(token).transfer(msg.sender, balance);
    }
}
