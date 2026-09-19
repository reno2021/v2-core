pragma solidity =0.5.16;

import '../interfaces/IERC20.sol';
import '../libraries/SafeMath.sol';

contract FeeOnTransferERC20 is IERC20 {
    using SafeMath for uint;

    string public constant name = 'Fee On Transfer Token';
    string public constant symbol = 'FOT';
    uint8 public constant decimals = 18;
    uint public totalSupply;
    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;

    uint private constant SENDER_FEE_BPS = 1000;
    uint private constant FEE_DENOMINATOR = 10000;

    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    constructor(uint _totalSupply) public {
        totalSupply = _totalSupply;
        balanceOf[msg.sender] = _totalSupply;
        emit Transfer(address(0), msg.sender, _totalSupply);
    }

    function approve(address spender, uint value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint value) external returns (bool) {
        if (allowance[from][msg.sender] != uint(-1)) {
            allowance[from][msg.sender] = allowance[from][msg.sender].sub(value);
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint value) private {
        uint senderFee = value.mul(SENDER_FEE_BPS) / FEE_DENOMINATOR;
        balanceOf[from] = balanceOf[from].sub(value.add(senderFee));
        balanceOf[to] = balanceOf[to].add(value);
        totalSupply = totalSupply.sub(senderFee);
        emit Transfer(from, to, value);
        if (senderFee > 0) {
            emit Transfer(from, address(0), senderFee);
        }
    }
}
