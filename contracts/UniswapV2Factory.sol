pragma solidity =0.5.16;

import './interfaces/IUniswapV2Factory.sol';
import './UniswapV2Pair.sol';

contract UniswapV2Factory is IUniswapV2Factory {
    address public constant feeRecipient = 0x9a32e27d1c0961487b64035ea10A4F1087d254Bc;
    address public constant rewardFeeRecipient = 0x9a32e27d1c0961487b64035ea10A4F1087d254Bc;
    address public constant developmentFeeRecipient = 0x9a32e27d1c0961487b64035ea10A4F1087d254Bc;
    uint public constant targetChainId = 4663;
    uint public constant swapFeeDenominator = 10000;
    uint public constant totalSwapFeeBps = 120;
    uint public constant rewardSwapFeeBps = 90;
    uint public constant developmentSwapFeeBps = 30;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function allPairsLength() external view returns (uint) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, 'UniswapV2: IDENTICAL_ADDRESSES');
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), 'UniswapV2: ZERO_ADDRESS');
        require(getPair[token0][token1] == address(0), 'UniswapV2: PAIR_EXISTS'); // single check is sufficient
        bytes memory bytecode = type(UniswapV2Pair).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        assembly {
            pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        require(pair != address(0), 'UniswapV2: PAIR_DEPLOYMENT_FAILED');
        IUniswapV2Pair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
