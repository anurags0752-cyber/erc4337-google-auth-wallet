// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract PasskeyAccount is IAccount{
    error MsgSenderIsNotEntryPoint();
    error TransactionCannotBeCompleted(bytes result);
    error PrefundFailed();

    
    bytes32 internal immutable publicKey_x;
    bytes32 internal immutable publicKey_y;
    address constant entryPoint = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    modifier onlyEntryPointCanCall() {
        if (msg.sender != entryPoint) {
            revert MsgSenderIsNotEntryPoint();
        }
        _;
    }
    constructor(bytes32 userPublicKey_x, bytes32 userPublicKey_y) {
        publicKey_x = userPublicKey_x;
        publicKey_y = userPublicKey_y;
    }

    receive() external payable {}

    function execute(
        address dest,
        uint256 value,
        bytes memory data
    ) external onlyEntryPointCanCall {
        (bool success, bytes memory result) = dest.call{value: value}(data);
        if (!success) {
            revert TransactionCannotBeCompleted(result);
        }
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPointCanCall returns (uint256) {
        if (missingAccountFunds > 0) {
            (bool success, ) = msg.sender.call{value: missingAccountFunds}("");
            if (!success) revert PrefundFailed();
        }

        bool result = _verification(userOp, userOpHash);

        if (result) {
            return SIG_VALIDATION_SUCCESS;
        } else {
            return SIG_VALIDATION_FAILED;
        }
    }

    function _verification(PackedUserOperation calldata userOp, bytes32 userOpHash) internal view returns (bool) {
        // 1. DECODE WITH OFFSET: Extract the WebAuthn payload and the exact string index
        (
            bytes memory authenticatorData,
            bytes memory clientDataJSON,
            uint256 challengeOffset,
            uint256 r,
            uint256 s
        ) = abi.decode(userOp.signature, (bytes, bytes, uint256, uint256, uint256));

        // 2. HARDWARE SECURITY: Check WebAuthn "User Present" (UP) Flag
        // authenticatorData[32] contains the bitwise flags. Bit 0 (0x01) MUST be true.
        if (authenticatorData.length < 37 || (uint8(authenticatorData[32]) & 0x01) == 0) {
            return false;
        }

        // 3. REPLAY PROTECTION: Verify userOpHash is inside the JSON
        // Encode the 32-byte hash into a Base64URL string (which becomes exactly 43 bytes)
        string memory expectedChallengeStr = Base64.encodeURL(abi.encodePacked(userOpHash));
        bytes memory expectedChallenge = bytes(expectedChallengeStr);
        
        if (clientDataJSON.length < challengeOffset + expectedChallenge.length) {
            return false; // Prevent out-of-bounds errors
        }

        // Gas-optimized string match: check if the Base64URL hash is exactly at the offset
        for (uint256 i = 0; i < expectedChallenge.length; i++) {
            if (clientDataJSON[challengeOffset + i] != expectedChallenge[i]) {
                return false;
            }
        }

        // 4. RECONSTRUCT HARDWARE HASH
        // WebAuthn signs the SHA-256 hash of the authenticatorData concatenated with the SHA-256 hash of the JSON
        bytes32 clientDataHash = sha256(clientDataJSON);
        bytes32 messageHash = sha256(abi.encodePacked(authenticatorData, clientDataHash));

        // Load immutables into local stack variables so Yul assembly can read them
        bytes32 localPubKeyX = publicKey_x;
        bytes32 localPubKeyY = publicKey_y;

        // 5. GAS OPTIMIZATION: Call RIP-7212 via Inline Assembly
        bool success;
        uint256 result;
        
        assembly {
            // Grab the free memory pointer
            let ptr := mload(0x40)
            
            // Pack the 160-byte payload manually: (messageHash, r, s, x, y)
            mstore(ptr, messageHash)
            mstore(add(ptr, 0x20), r)
            mstore(add(ptr, 0x40), s)
            mstore(add(ptr, 0x60), localPubKeyX) // Read from stack
            mstore(add(ptr, 0x80), localPubKeyY) // Read from stack
            
            // staticcall(gasLimit, precompileAddress, argsOffset, argsSize, retOffset, retSize)
            success := staticcall(gas(), 0x100, ptr, 0xA0, ptr, 0x20)
            
            // Load the 32-byte return value from the precompile
            result := mload(ptr)
        }

        return success && (result == 1);
    }
}
