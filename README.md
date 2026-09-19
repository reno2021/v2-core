# Robinhood Chain Dex & Stake V2 Core

Production-oriented Uniswap V2 core fork for **Robinhood Chain Dex & Stake**, keeping the upstream Solidity `0.5.16` architecture where practical while changing swap-fee accounting for Robinhood Chain.

## Network constants

- Repository: `reno2021/v2-core`
- Target chain: Robinhood Chain
- `chainId`: `4663`
- RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://blockscout.com`
- Immutable admin wallet (user-supplied): `0x9a32e27d1c0961487b64035ea10a4f1087d254bc`
  - Solidity checksum form used on-chain: `0x9a32e27d1c0961487b64035ea10A4F1087d254Bc`

## What changed from upstream Uniswap V2 core

- `UniswapV2Factory` stays permissionless for pair creation.
- The old optional `feeTo`/`feeToSetter` mint-fee path is removed.
- `UniswapV2Pair` now applies a **1.2% fee-on-input swap model**:
  - `0.9%` accounting allocation for rewards / buybacks / burns / raffles
  - `0.3%` accounting allocation for development
- The pair transfers those two portions separately. They currently go to the same immutable admin wallet, and the contracts emit a per-swap summary event so the split can be tracked off-chain.

## Fee model

The pair keeps Uniswap V2's invariant-based swap flow, but uses a Robinhood-specific denominator of `10_000` basis points:

- `FEE_DENOMINATOR = 10000`
- `TOTAL_SWAP_FEE_BPS = 120`
- `REWARD_SWAP_FEE_BPS = 90`
- `DEVELOPMENT_SWAP_FEE_BPS = 30`

For an input amount `amountIn`:

- total fee transferred to the admin wallet = `floor(amountIn * 120 / 10000)`
- effective input used by AMM pricing = `amountIn - fee`
- output pricing therefore matches a fee-on-input quote model:

```text
amountInWithFee = amountIn * 9880
amountOut = (amountInWithFee * reserveOut) / (reserveIn * 10000 + amountInWithFee)
```

This preserves coherent reserve accounting:

1. traders send input tokens to the pair,
2. the pair validates the invariant using the fee-adjusted balances,
3. the pair transfers the protocol fee to the admin wallet,
4. reserves are updated to the **post-fee** balances.

Routers/periphery quoting this core fork must use the same `1.2%` fee formula instead of Uniswap's default `0.3%` (`997/1000`) math.

## Events and constants

`UniswapV2Factory` exposes:

- `feeRecipient()`
- `rewardFeeRecipient()`
- `developmentFeeRecipient()`
- `targetChainId()`
- `swapFeeDenominator()`
- `totalSwapFeeBps()`
- `rewardSwapFeeBps()`
- `developmentSwapFeeBps()`

`UniswapV2Pair` emits:

- standard `Mint`, `Burn`, `Swap`, `Sync`
- `ProtocolFeePaid(sender, token, recipient, totalAmount, rewardAmount, developmentAmount)` once per token-side fee payment, with `totalAmount = rewardAmount + developmentAmount`

Because integer division rounds down, `rewardAmount` is computed first and `developmentAmount` receives any remainder so the emitted split always sums to the exact transferred fee.

## Deployment order

This repository is **core only**. It does not deploy anything automatically and does not use a private key.

Recommended deployment order for the full Robinhood DEX stack:

1. Deploy `UniswapV2Factory`
2. Deploy or configure the Robinhood wrapped native token / WETH equivalent externally
3. Deploy the compatible V2 periphery/router fork configured for chainId `4663`
4. Create pairs permissionlessly via the factory
5. Add liquidity through the router/periphery
6. Deploy staking / farm contracts separately

## Staking and lockups

The lock periods and early-withdrawal policy from the issue belong in the companion staking/farm repository, not in Uniswap V2 core pair contracts.

Required staking-side policy to implement outside this repo:

- flexible / immediate release
- `3`, `7`, `30`, `60`, `90`, `365`, and `1460` day lock periods
- `9.7%` early-withdrawal fee to the same admin wallet
- liquidity-dependent reward rates

This core repo intentionally does **not** add privileged staking drains, mutable admin switches, or non-AMM lockup logic to LP pair contracts.

## Security assumptions

- Pair creation remains permissionless, matching upstream Uniswap V2 behavior.
- The admin wallet is immutable in this core fork.
- Flash swaps remain supported.
- Reentrancy protection remains the upstream pair-level `lock` guard.
- Tokens that reduce the pair's balance during the protocol-fee payout path are rejected with `UniswapV2: FEE_ON_TRANSFER_UNSUPPORTED`.
- There is no audit or deployment claim in this repository.
- Solidity compatibility target remains `0.5.16`.

## Local development

```bash
npm install
npm run compile
npm test
```

## Tests added / retained

The test suite covers:

- factory constants and permissionless pair creation
- swap fee accounting and admin fee receipt
- invariant preservation and over-withdrawal reverts
- exact-input / zero-output edge cases
- flash-swap repayment with the Robinhood fee model
- reentrancy protection during flash-swap callbacks
- unchanged ERC-20 LP token behavior
