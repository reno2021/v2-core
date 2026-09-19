pragma solidity >=0.5.0;

interface IUniswapV2Factory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function feeRecipient() external pure returns (address);
    function rewardFeeRecipient() external pure returns (address);
    function developmentFeeRecipient() external pure returns (address);
    function targetChainId() external pure returns (uint);
    function swapFeeDenominator() external pure returns (uint);
    function totalSwapFeeBps() external pure returns (uint);
    function rewardSwapFeeBps() external pure returns (uint);
    function developmentSwapFeeBps() external pure returns (uint);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);
}
