pragma solidity =0.5.16;

contract ChainId {
    function getChainId() external pure returns (uint chainId) {
        assembly {
            chainId := chainid
        }
    }
}
