pragma solidity =0.5.16;

import '../interfaces/IERC20.sol';
import '../interfaces/IUniswapV2Callee.sol';
import '../interfaces/IUniswapV2Pair.sol';

contract MockUniswapV2Callee is IUniswapV2Callee {
    address public expectedPair;
    uint public repayAmount0;
    uint public repayAmount1;
    bool public attemptReentrancy;

    function configure(address _expectedPair, uint _repayAmount0, uint _repayAmount1, bool _attemptReentrancy) external {
        expectedPair = _expectedPair;
        repayAmount0 = _repayAmount0;
        repayAmount1 = _repayAmount1;
        attemptReentrancy = _attemptReentrancy;
    }

    function uniswapV2Call(address, uint, uint, bytes calldata) external {
        require(msg.sender == expectedPair, 'MockUniswapV2Callee: UNEXPECTED_PAIR');

        if (attemptReentrancy) {
            IUniswapV2Pair(msg.sender).sync();
        }

        if (repayAmount0 > 0) {
            IERC20(IUniswapV2Pair(msg.sender).token0()).transfer(msg.sender, repayAmount0);
        }
        if (repayAmount1 > 0) {
            IERC20(IUniswapV2Pair(msg.sender).token1()).transfer(msg.sender, repayAmount1);
        }
    }
}
