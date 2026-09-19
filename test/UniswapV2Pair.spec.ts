import chai, { expect } from "chai";
import { Contract } from "ethers";
import { AddressZero } from "ethers/constants";
import { BigNumber, bigNumberify } from "ethers/utils";
import {
  solidity,
  MockProvider,
  createFixtureLoader,
  deployContract
} from "ethereum-waffle";

import { expandTo18Decimals, mineBlock, encodePrice } from "./shared/utilities";
import { pairFixture } from "./shared/fixtures";

import MockUniswapV2Callee from "../build/MockUniswapV2Callee.json";

const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3);
const FEE_DENOMINATOR = bigNumberify(10000);
const TOTAL_SWAP_FEE_BPS = bigNumberify(120);
const REWARD_SWAP_FEE_BPS = bigNumberify(90);
const DEVELOPMENT_SWAP_FEE_BPS = bigNumberify(30);
const ADMIN_WALLET = "0x9a32e27d1c0961487b64035ea10A4F1087d254Bc";

chai.use(solidity);

const overrides = {
  gasLimit: 9999999
};

function getAmountOut(
  amountIn: BigNumber,
  reserveIn: BigNumber,
  reserveOut: BigNumber
): BigNumber {
  const amountInWithFee = amountIn.mul(FEE_DENOMINATOR.sub(TOTAL_SWAP_FEE_BPS));
  return amountInWithFee
    .mul(reserveOut)
    .div(reserveIn.mul(FEE_DENOMINATOR).add(amountInWithFee));
}

function getAmountIn(
  amountOut: BigNumber,
  reserveIn: BigNumber,
  reserveOut: BigNumber
): BigNumber {
  const numerator = reserveIn.mul(amountOut).mul(FEE_DENOMINATOR);
  const denominator = reserveOut
    .sub(amountOut)
    .mul(FEE_DENOMINATOR.sub(TOTAL_SWAP_FEE_BPS));
  return numerator.div(denominator).add(1);
}

function getFlashRepaymentSameToken(amountOut: BigNumber): BigNumber {
  const multiplier = FEE_DENOMINATOR.sub(TOTAL_SWAP_FEE_BPS);
  return amountOut
    .mul(FEE_DENOMINATOR)
    .add(multiplier)
    .sub(1)
    .div(multiplier);
}

describe("UniswapV2Pair", () => {
  const provider = new MockProvider({
    hardfork: "istanbul",
    mnemonic: "horn horn horn horn horn horn horn horn horn horn horn horn",
    gasLimit: 9999999
  });
  const [wallet] = provider.getWallets();
  const loadFixture = createFixtureLoader(provider, [wallet]);

  let factory: Contract;
  let token0: Contract;
  let token1: Contract;
  let pair: Contract;
  beforeEach(async () => {
    const fixture = await loadFixture(pairFixture);
    factory = fixture.factory;
    token0 = fixture.token0;
    token1 = fixture.token1;
    pair = fixture.pair;
  });

  async function addLiquidity(
    token0Amount: BigNumber,
    token1Amount: BigNumber
  ) {
    await token0.transfer(pair.address, token0Amount);
    await token1.transfer(pair.address, token1Amount);
    await pair.mint(wallet.address, overrides);
  }

  it("mint", async () => {
    const token0Amount = expandTo18Decimals(1);
    const token1Amount = expandTo18Decimals(4);
    await token0.transfer(pair.address, token0Amount);
    await token1.transfer(pair.address, token1Amount);

    const expectedLiquidity = expandTo18Decimals(2);
    await expect(pair.mint(wallet.address, overrides))
      .to.emit(pair, "Transfer")
      .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(pair, "Transfer")
      .withArgs(
        AddressZero,
        wallet.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY)
      )
      .to.emit(pair, "Sync")
      .withArgs(token0Amount, token1Amount)
      .to.emit(pair, "Mint")
      .withArgs(wallet.address, token0Amount, token1Amount);

    expect(await pair.totalSupply()).to.eq(expectedLiquidity);
    expect(await pair.balanceOf(wallet.address)).to.eq(
      expectedLiquidity.sub(MINIMUM_LIQUIDITY)
    );
  });

  it("swap routes 1.2 percent input fee to admin and preserves reserves", async () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    await addLiquidity(token0Amount, token1Amount);

    const swapAmount = expandTo18Decimals(1);
    const expectedOutputAmount = getAmountOut(
      swapAmount,
      token0Amount,
      token1Amount
    );
    const expectedFee = swapAmount.mul(TOTAL_SWAP_FEE_BPS).div(FEE_DENOMINATOR);
    const expectedRewardFee = swapAmount
      .mul(REWARD_SWAP_FEE_BPS)
      .div(FEE_DENOMINATOR);
    const expectedDevelopmentFee = expectedFee.sub(expectedRewardFee);

    await token0.transfer(pair.address, swapAmount);
    await expect(
      pair.swap(0, expectedOutputAmount, wallet.address, "0x", overrides)
    )
      .to.emit(pair, "ProtocolFeePaid")
      .withArgs(
        wallet.address,
        token0.address,
        ADMIN_WALLET,
        expectedRewardFee,
        expectedRewardFee,
        0
      )
      .to.emit(pair, "ProtocolFeePaid")
      .withArgs(
        wallet.address,
        token0.address,
        ADMIN_WALLET,
        expectedDevelopmentFee,
        0,
        expectedDevelopmentFee
      )
      .to.emit(pair, "Swap")
      .withArgs(
        wallet.address,
        swapAmount,
        0,
        0,
        expectedOutputAmount,
        wallet.address
      );

    const reserves = await pair.getReserves();
    const expectedReserve0 = token0Amount.add(swapAmount).sub(expectedFee);
    const expectedReserve1 = token1Amount.sub(expectedOutputAmount);
    expect(reserves[0]).to.eq(expectedReserve0);
    expect(reserves[1]).to.eq(expectedReserve1);
    expect(await token0.balanceOf(ADMIN_WALLET)).to.eq(expectedFee);
    expect(expectedReserve0.mul(expectedReserve1)).to.be.gte(
      token0Amount.mul(token1Amount)
    );
  });

  it("rejects outputs above the fee-adjusted invariant", async () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    await addLiquidity(token0Amount, token1Amount);

    const swapAmount = expandTo18Decimals(1);
    const expectedOutputAmount = getAmountOut(
      swapAmount,
      token0Amount,
      token1Amount
    );
    await token0.transfer(pair.address, swapAmount);
    await expect(
      pair.swap(0, expectedOutputAmount.add(1), wallet.address, "0x", overrides)
    ).to.be.revertedWith("UniswapV2: K");
  });

  it("supports flash swaps when the callback repays the same token plus fee", async () => {
    const reserve0 = expandTo18Decimals(5);
    const reserve1 = expandTo18Decimals(5);
    await addLiquidity(reserve0, reserve1);

    const amount0Out = bigNumberify("997000000000000000");
    const repayment = getFlashRepaymentSameToken(amount0Out);
    const expectedFee = repayment.mul(TOTAL_SWAP_FEE_BPS).div(FEE_DENOMINATOR);
    const expectedRewardFee = repayment
      .mul(REWARD_SWAP_FEE_BPS)
      .div(FEE_DENOMINATOR);
    const expectedDevelopmentFee = expectedFee.sub(expectedRewardFee);

    const callee = await deployContract(wallet, MockUniswapV2Callee, []);
    await token0.transfer(callee.address, repayment);
    await callee.configure(pair.address, repayment, 0, false);

    await expect(pair.swap(amount0Out, 0, callee.address, "0x01", overrides))
      .to.emit(pair, "ProtocolFeePaid")
      .withArgs(
        wallet.address,
        token0.address,
        ADMIN_WALLET,
        expectedRewardFee,
        expectedRewardFee,
        0
      )
      .to.emit(pair, "ProtocolFeePaid")
      .withArgs(
        wallet.address,
        token0.address,
        ADMIN_WALLET,
        expectedDevelopmentFee,
        0,
        expectedDevelopmentFee
      );

    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(
      reserve0
        .add(repayment)
        .sub(amount0Out)
        .sub(expectedFee)
    );
    expect(reserves[1]).to.eq(reserve1);
  });

  it("supports flash swaps repaid with the opposite token", async () => {
    const reserve0 = expandTo18Decimals(5);
    const reserve1 = expandTo18Decimals(10);
    await addLiquidity(reserve0, reserve1);

    const amount0Out = expandTo18Decimals(1);
    const repayment1 = getAmountIn(amount0Out, reserve1, reserve0);
    const expectedFee = repayment1.mul(TOTAL_SWAP_FEE_BPS).div(FEE_DENOMINATOR);
    const expectedRewardFee = repayment1
      .mul(REWARD_SWAP_FEE_BPS)
      .div(FEE_DENOMINATOR);
    const expectedDevelopmentFee = expectedFee.sub(expectedRewardFee);

    const callee = await deployContract(wallet, MockUniswapV2Callee, []);
    await token1.transfer(callee.address, repayment1);
    await callee.configure(pair.address, 0, repayment1, false);

    await expect(pair.swap(amount0Out, 0, callee.address, "0x01", overrides))
      .to.emit(pair, "ProtocolFeePaid")
      .withArgs(
        wallet.address,
        token1.address,
        ADMIN_WALLET,
        expectedRewardFee,
        expectedRewardFee,
        0
      )
      .to.emit(pair, "ProtocolFeePaid")
      .withArgs(
        wallet.address,
        token1.address,
        ADMIN_WALLET,
        expectedDevelopmentFee,
        0,
        expectedDevelopmentFee
      );

    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(reserve0.sub(amount0Out));
    expect(reserves[1]).to.eq(reserve1.add(repayment1).sub(expectedFee));
    expect(await token1.balanceOf(ADMIN_WALLET)).to.eq(expectedFee);
  });

  it("blocks reentrancy during flash swap callbacks", async () => {
    const reserve0 = expandTo18Decimals(5);
    const reserve1 = expandTo18Decimals(5);
    await addLiquidity(reserve0, reserve1);

    const callee = await deployContract(wallet, MockUniswapV2Callee, []);
    await callee.configure(pair.address, 0, 0, true);

    await expect(
      pair.swap(bigNumberify(1), 0, callee.address, "0x01", overrides)
    ).to.be.revertedWith("UniswapV2: LOCKED");
  });

  it("handles zero and exact-input edge cases", async () => {
    await expect(
      pair.swap(0, 0, wallet.address, "0x", overrides)
    ).to.be.revertedWith("UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");

    const token0Amount = expandTo18Decimals(10);
    const token1Amount = expandTo18Decimals(10);
    await addLiquidity(token0Amount, token1Amount);

    const amountOut = expandTo18Decimals(1);
    const amountIn = getAmountIn(amountOut, token0Amount, token1Amount);
    const expectedFee = amountIn.mul(TOTAL_SWAP_FEE_BPS).div(FEE_DENOMINATOR);
    await token0.transfer(pair.address, amountIn);
    await pair.swap(0, amountOut, wallet.address, "0x", overrides);

    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(token0Amount.add(amountIn).sub(expectedFee));
    expect(reserves[1]).to.eq(token1Amount.sub(amountOut));
  });

  it("burn", async () => {
    const token0Amount = expandTo18Decimals(3);
    const token1Amount = expandTo18Decimals(3);
    await addLiquidity(token0Amount, token1Amount);

    const expectedLiquidity = expandTo18Decimals(3);
    await pair.transfer(pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY));
    await expect(pair.burn(wallet.address, overrides))
      .to.emit(pair, "Transfer")
      .withArgs(
        pair.address,
        AddressZero,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY)
      )
      .to.emit(token0, "Transfer")
      .withArgs(pair.address, wallet.address, token0Amount.sub(1000))
      .to.emit(token1, "Transfer")
      .withArgs(pair.address, wallet.address, token1Amount.sub(1000))
      .to.emit(pair, "Sync")
      .withArgs(1000, 1000)
      .to.emit(pair, "Burn")
      .withArgs(
        wallet.address,
        token0Amount.sub(1000),
        token1Amount.sub(1000),
        wallet.address
      );
  });

  it("price cumulatives remain functional after fee changes", async () => {
    const token0Amount = expandTo18Decimals(3);
    const token1Amount = expandTo18Decimals(3);
    await addLiquidity(token0Amount, token1Amount);

    const blockTimestamp = (await pair.getReserves())[2];
    await mineBlock(provider, blockTimestamp + 1);
    await pair.sync(overrides);

    const initialPrice = encodePrice(token0Amount, token1Amount);
    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0]);
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1]);

    const swapAmount = expandTo18Decimals(3);
    const expectedOutput = getAmountOut(swapAmount, token0Amount, token1Amount);
    await token0.transfer(pair.address, swapAmount);
    await mineBlock(provider, blockTimestamp + 10);
    await pair.swap(0, expectedOutput, wallet.address, "0x", overrides);

    const effectiveInput = swapAmount.sub(
      swapAmount.mul(TOTAL_SWAP_FEE_BPS).div(FEE_DENOMINATOR)
    );
    const newReserve0 = token0Amount.add(effectiveInput);
    const newReserve1 = token1Amount.sub(expectedOutput);

    expect(await pair.price0CumulativeLast()).to.eq(initialPrice[0].mul(10));
    expect(await pair.price1CumulativeLast()).to.eq(initialPrice[1].mul(10));

    await mineBlock(provider, blockTimestamp + 20);
    await pair.sync(overrides);
    const newPrice = encodePrice(newReserve0, newReserve1);
    expect(await pair.price0CumulativeLast()).to.eq(
      initialPrice[0].mul(10).add(newPrice[0].mul(10))
    );
    expect(await pair.price1CumulativeLast()).to.eq(
      initialPrice[1].mul(10).add(newPrice[1].mul(10))
    );
  });
});
