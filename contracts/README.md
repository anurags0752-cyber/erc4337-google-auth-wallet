# ERC-4337 Passkey Smart Contracts (`RIP-7212` on Base Sepolia)

Solidity smart contracts implementing an **ERC-4337 v0.7 Smart Account (`IAccount`)** secured by hardware **WebAuthn Passkeys (`secp256r1` / P-256)** and verified on-chain via the **RIP-7212 Precompile (`0x0000000000000000000000000000000000000100`)**.

## Contracts

- **`src/PasskeyAccount.sol`**:
  - Stores the user's 64-byte uncompressed P-256 public key coordinates `(publicKey_x, publicKey_y)` as `immutable` variables.
  - Verifies the WebAuthn User Present (`UP`) bit (`authenticatorData[32] & 0x01 != 0`).
  - Protects against replay attacks by Base64URL-encoding `userOpHash` on-chain and matching it against `clientDataJSON` at `challengeOffset`.
  - Executes an inline Yul assembly `staticcall` to the RIP-7212 precompile at `0x100` (`~3,450 gas`).
- **`src/PasskeyAccountFactory.sol`**:
  - Deploys deterministic smart accounts via `CREATE2` using `keccak256(abi.encodePacked(publicKey_x, publicKey_y))` as the salt.
  - Deployed on Base Sepolia at [`0xBBC847b874985f7787E3B2756fB71Ca640bd57fF`](https://sepolia.basescan.org/address/0xBBC847b874985f7787E3B2756fB71Ca640bd57fF).
- **`test/PasskeyAccount.t.sol`**:
  - Foundry unit tests covering deterministic `CREATE2` prediction, factory idempotency, EntryPoint access control, RIP-7212 `validateUserOp` verification, and replay attack rejection.

## Commands

```bash
# Compile contracts
forge build

# Run unit tests
forge test -vvv

# Deploy PasskeyAccountFactory to Base Sepolia
forge script script/DeployFactory.s.sol:DeployFactory --rpc-url https://sepolia.base.org --broadcast
```
