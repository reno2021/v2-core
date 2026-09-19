import chai, { expect } from "chai";
import { Contract } from "ethers";
import { bigNumberify } from "ethers/utils";
import { solidity, MockProvider, createFixtureLoader } from "ethereum-waffle";

import { getCreate2Address } from "./shared/utilities";
import { factoryFixture } from "./shared/fixtures";

import UniswapV2Pair from "../build/UniswapV2Pair.json";

chai.use(solidity);

const TEST_ADDRESSES: [string, string] = [
  "0x1000000000000000000000000000000000000000",
  "0x2000000000000000000000000000000000000000"
];

describe("UniswapV2Factory", () => {
  const provider = new MockProvider({
    hardfork: "istanbul",
    mnemonic: "horn horn horn horn horn horn horn horn horn horn horn horn",
    gasLimit: 9999999
  });
  const [wallet, other] = provider.getWallets();
  const loadFixture = createFixtureLoader(provider, [wallet, other]);

  let factory: Contract;
  beforeEach(async () => {
    const fixture = await loadFixture(factoryFixture);
    factory = fixture.factory;
  });

  it("constants and allPairsLength", async () => {
    expect(await factory.feeRecipient()).to.eq(
      "0x9a32e27d1c0961487b64035ea10A4F1087d254Bc"
    );
    expect(await factory.rewardFeeRecipient()).to.eq(
      "0x9a32e27d1c0961487b64035ea10A4F1087d254Bc"
    );
    expect(await factory.developmentFeeRecipient()).to.eq(
      "0x9a32e27d1c0961487b64035ea10A4F1087d254Bc"
    );
    expect(await factory.targetChainId()).to.eq(4663);
    expect(await factory.totalSwapFeeBps()).to.eq(120);
    expect(await factory.rewardSwapFeeBps()).to.eq(90);
    expect(await factory.developmentSwapFeeBps()).to.eq(30);
    expect(await factory.allPairsLength()).to.eq(0);
  });

  async function createPair(tokens: [string, string]) {
    const bytecode = `0x${UniswapV2Pair.evm.bytecode.object}`;
    const create2Address = getCreate2Address(factory.address, tokens, bytecode);
    await expect(factory.createPair(...tokens))
      .to.emit(factory, "PairCreated")
      .withArgs(
        TEST_ADDRESSES[0],
        TEST_ADDRESSES[1],
        create2Address,
        bigNumberify(1)
      );

    await expect(factory.createPair(...tokens)).to.be.reverted;
    await expect(factory.createPair(...tokens.slice().reverse())).to.be
      .reverted;
    expect(await factory.getPair(...tokens)).to.eq(create2Address);
    expect(await factory.getPair(...tokens.slice().reverse())).to.eq(
      create2Address
    );
    expect(await factory.allPairs(0)).to.eq(create2Address);
    expect(await factory.allPairsLength()).to.eq(1);

    const pair = new Contract(
      create2Address,
      JSON.stringify(UniswapV2Pair.abi),
      provider
    );
    expect(await pair.factory()).to.eq(factory.address);
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0]);
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1]);
  }

  it("createPair", async () => {
    await createPair(TEST_ADDRESSES);
  });

  it("createPair:reverse", async () => {
    await createPair(TEST_ADDRESSES.slice().reverse() as [string, string]);
  });
});
