// src/constants/config.ts
import { parseAbi } from 'viem';

export const CHAIN_CONFIG = {
  chainId: 84532,
  name: 'Base Sepolia',
  rpcUrl: process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia.base.org',
  explorerUrl: 'https://sepolia.basescan.org',
  blockscoutApiUrl: 'https://base-sepolia.blockscout.com/api',
  faucetUrl: 'https://www.alchemy.com/faucets/base-sepolia',
};

export const CONTRACTS = {
  // Official ERC-4337 EntryPoint v0.7
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as `0x${string}`,
  // Deployed PasskeyAccountFactory on Base Sepolia
  factory: '0xBBC847b874985f7787E3B2756fB71Ca640bd57fF' as `0x${string}`,
  // RIP-7212 secp256r1 Precompile on OP Stack / Base
  rip7212Precompile: '0x0000000000000000000000000000000000000100' as `0x${string}`,
};

export const DEFAULT_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || 'https://passkey4337.vercel.app';

export const DEFAULT_BUNDLER_URL = process.env.EXPO_PUBLIC_BUNDLER_URL || '';

export const RP_ID = 'anurags0752-cyber.github.io';

export const FACTORY_ABI = parseAbi([
  'function getAddress(bytes32 publicKey_x, bytes32 publicKey_y) view returns (address)',
  'function createAccount(bytes32 publicKey_x, bytes32 publicKey_y) returns (address)',
]);

export const ACCOUNT_ABI = parseAbi([
  'function execute(address dest, uint256 value, bytes data) external',
  'function validateUserOp((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp, bytes32 userOpHash, uint256 missingAccountFunds) external returns (uint256)',
]);

export const ENTRYPOINT_ABI = parseAbi([
  'function getNonce(address sender, uint192 key) view returns (uint256)',
  'function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, bytes32 accountGasLimits, uint256 preVerificationGas, bytes32 gasFees, bytes paymasterAndData, bytes signature) userOp) view returns (bytes32)',
  'function balanceOf(address account) view returns (uint256)',
]);

