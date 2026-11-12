// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PasskeyAccount} from "../src/PasskeyAccount.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @dev Helper contract to test arbitrary contract calls & revert propagation through PasskeyAccount.execute()
contract MockTarget {
    uint256 public valueStored;
    error CustomTargetRevert(uint256 code);

    function setValue(uint256 _val) external payable {
        valueStored = _val;
    }

    function alwaysReverts() external pure {
        revert CustomTargetRevert(404);
    }
}

/// @dev Helper contract that rejects incoming ETH transfers to test PrefundFailed
contract RevertingEntryPoint {
    receive() external payable {
        revert("ETH_REJECTED");
    }
}

contract PasskeyAccountTest is Test {
    PasskeyAccountFactory internal factory;
    PasskeyAccount internal account;
    MockTarget internal target;

    address internal constant ENTRY_POINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address internal constant RIP7212_PRECOMPILE = 0x0000000000000000000000000000000000000100;

    // Standard NIST P-256 generator coordinates as test public key
    bytes32 internal constant TEST_PUBKEY_X =
        0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296;
    bytes32 internal constant TEST_PUBKEY_Y =
        0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5;

    function setUp() public {
        factory = new PasskeyAccountFactory();
        account = factory.createAccount(TEST_PUBKEY_X, TEST_PUBKEY_Y);
        target = new MockTarget();
        vm.deal(address(account), 10 ether);
    }

    // =========================================================================
    // 1. Receive & ETH Handling Tests
    // =========================================================================

    function test_ReceiveEtherDirectly() public {
        uint256 beforeBal = address(account).balance;
        (bool ok, ) = address(account).call{value: 2 ether}("");
        assertTrue(ok, "Smart account should accept direct ETH transfers");
        assertEq(address(account).balance, beforeBal + 2 ether);
    }

    // =========================================================================
    // 2. Execute & Access Control Tests
    // =========================================================================

    function test_RevertWhen_NonEntryPointCallsExecute() public {
        address attacker = address(0xBAD);
        vm.prank(attacker);
        vm.expectRevert(PasskeyAccount.MsgSenderIsNotEntryPoint.selector);
        account.execute(address(0xBEEF), 1 ether, "");
    }

    function test_Execute_NativeEthTransferFromEntryPoint() public {
        address recipient = address(0xCAFE);
        uint256 beforeBal = address(account).balance;

        vm.prank(ENTRY_POINT);
        account.execute(recipient, 1.5 ether, "");

        assertEq(recipient.balance, 1.5 ether);
        assertEq(address(account).balance, beforeBal - 1.5 ether);
    }

    function test_Execute_ContractCallWithCalldata() public {
        bytes memory callData = abi.encodeCall(MockTarget.setValue, (42));

        vm.prank(ENTRY_POINT);
        account.execute(address(target), 0.25 ether, callData);

        assertEq(target.valueStored(), 42);
        assertEq(address(target).balance, 0.25 ether);
    }

    function test_RevertWhen_ExecuteTargetCallFails() public {
        bytes memory callData = abi.encodeCall(MockTarget.alwaysReverts, ());
        bytes memory expectedInnerError = abi.encodeWithSelector(
            MockTarget.CustomTargetRevert.selector,
            404
        );

        vm.prank(ENTRY_POINT);
        vm.expectRevert(
            abi.encodeWithSelector(
                PasskeyAccount.TransactionCannotBeCompleted.selector,
                expectedInnerError
            )
        );
        account.execute(address(target), 0, callData);
    }

    // =========================================================================
    // 3. validateUserOp Access Control & Prefund Tests
    // =========================================================================

    function test_RevertWhen_NonEntryPointCallsValidateUserOp() public {
        PackedUserOperation memory userOp = _buildSignedUserOp(keccak256("op"), 0x05, 1, 2);
        vm.prank(address(0xBAD));
        vm.expectRevert(PasskeyAccount.MsgSenderIsNotEntryPoint.selector);
        account.validateUserOp(userOp, keccak256("op"), 0);
    }

    function test_ValidateUserOp_PaysMissingAccountFundsToEntryPoint() public {
        bytes32 userOpHash = keccak256("prefund_test_op");
        uint256 r = 0x1111;
        uint256 s = 0x2222;
        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x05, r, s);

        _mockRip7212Call(userOp, r, s, 1);

        uint256 epBefore = ENTRY_POINT.balance;
        uint256 missingFunds = 0.05 ether;

        vm.prank(ENTRY_POINT);
        uint256 res = account.validateUserOp(userOp, userOpHash, missingFunds);

        assertEq(res, SIG_VALIDATION_SUCCESS);
        assertEq(ENTRY_POINT.balance, epBefore + missingFunds);
    }

    function test_RevertWhen_PrefundFailsDueToInsufficientBalance() public {
        bytes32 userOpHash = keccak256("insufficient_prefund");
        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x05, 1, 2);

        // Request more missingAccountFunds than the 10 ETH balance
        vm.prank(ENTRY_POINT);
        vm.expectRevert(PasskeyAccount.PrefundFailed.selector);
        account.validateUserOp(userOp, userOpHash, 100 ether);
    }

    function test_RevertWhen_EntryPointRejectsPrefund() public {
        // Etch reverting bytecode at ENTRY_POINT to simulate transfer failure
        RevertingEntryPoint revEp = new RevertingEntryPoint();
        vm.etch(ENTRY_POINT, address(revEp).code);

        bytes32 userOpHash = keccak256("reject_prefund");
        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x05, 1, 2);

        vm.prank(ENTRY_POINT);
        vm.expectRevert(PasskeyAccount.PrefundFailed.selector);
        account.validateUserOp(userOp, userOpHash, 0.01 ether);
    }

    // =========================================================================
    // 4. WebAuthn & RIP-7212 (0x100) Signature Verification Tests
    // =========================================================================

    function test_ValidateUserOp_SuccessWithExactRip7212Payload() public {
        bytes32 userOpHash = keccak256("valid_passkey_user_op");
        uint256 r = 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;
        uint256 s = 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;

        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x05, r, s);

        // Mock exact 160-byte payload (messageHash, r, s, TEST_PUBKEY_X, TEST_PUBKEY_Y) at 0x100
        _mockRip7212Call(userOp, r, s, 1);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, SIG_VALIDATION_SUCCESS);
    }

    function test_ValidateUserOp_WithRealVmSignP256Signature() public {
        // Because (TEST_PUBKEY_X, TEST_PUBKEY_Y) is the P-256 generator G = 1 * G,
        // its corresponding secp256r1 private key is 1.
        bytes32 userOpHash = keccak256("real_secp256r1_signed_userop");
        PackedUserOperation memory tempOp = _buildSignedUserOp(userOpHash, 0x05, 0, 0);

        (bytes memory authData, bytes memory clientDataJSON, , , ) = abi.decode(
            tempOp.signature,
            (bytes, bytes, uint256, uint256, uint256)
        );
        bytes32 messageHash = sha256(abi.encodePacked(authData, sha256(clientDataJSON)));

        (bytes32 rBytes, bytes32 sBytes) = vm.signP256(1, messageHash);
        PackedUserOperation memory userOp = _buildSignedUserOp(
            userOpHash,
            0x05,
            uint256(rBytes),
            uint256(sBytes)
        );

        _mockRip7212Call(userOp, uint256(rBytes), uint256(sBytes), 1);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, SIG_VALIDATION_SUCCESS);
    }

    function test_ValidateUserOp_FailsWhenAuthDataTooShort() public {
        bytes32 userOpHash = keccak256("short_auth_data");
        string memory challengeStr = Base64.encodeURL(abi.encodePacked(userOpHash));

        // 36 bytes (< 37 minimum required by WebAuthn spec)
        bytes memory shortAuthData = new bytes(36);
        string memory prefix = '{"type":"webauthn.get","challenge":"';
        bytes memory clientDataJSON = abi.encodePacked(prefix, challengeStr, '"}');

        PackedUserOperation memory userOp = _emptyUserOp();
        userOp.signature = abi.encode(
            shortAuthData,
            clientDataJSON,
            bytes(prefix).length,
            uint256(1),
            uint256(2)
        );

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, SIG_VALIDATION_FAILED);
    }

    function test_ValidateUserOp_FailsWhenUserPresentBitNotSet() public {
        bytes32 userOpHash = keccak256("missing_up_bit");
        // Flags byte = 0x04 (UV bit set, but Bit 0 UP = 0)
        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x04, 1, 2);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, SIG_VALIDATION_FAILED);
    }

    function test_ValidateUserOp_FailsWhenChallengeOffsetOutOfBounds() public {
        bytes32 userOpHash = keccak256("out_of_bounds_offset");
        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x01, 1, 2);

        (
            bytes memory authData,
            bytes memory clientDataJSON,
            ,
            uint256 r,
            uint256 s
        ) = abi.decode(userOp.signature, (bytes, bytes, uint256, uint256, uint256));

        // Set challengeOffset near the end of clientDataJSON so offset + 43 > length
        uint256 badOffset = clientDataJSON.length - 10;
        userOp.signature = abi.encode(authData, clientDataJSON, badOffset, r, s);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, SIG_VALIDATION_FAILED);
    }

    function test_ValidateUserOp_FailsOnTamperedChallengeReplayAttack() public {
        bytes32 realUserOpHash = keccak256("real_user_op");
        bytes32 signedOldHash = keccak256("old_replayed_user_op");

        // Build signature over signedOldHash, but validate against realUserOpHash
        PackedUserOperation memory userOp = _buildSignedUserOp(signedOldHash, 0x05, 1, 2);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, realUserOpHash, 0);
        assertEq(validationData, SIG_VALIDATION_FAILED);
    }

    function test_ValidateUserOp_FailsWhenRip7212PrecompileReturnsZero() public {
        bytes32 userOpHash = keccak256("bad_ecdsa_sig");
        uint256 r = 0xdead;
        uint256 s = 0xbeef;
        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x05, r, s);

        // Precompile returns 0 (invalid signature)
        _mockRip7212Call(userOp, r, s, 0);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, SIG_VALIDATION_FAILED);
    }

    // =========================================================================
    // 5. Fuzz Testing
    // =========================================================================

    function testFuzz_ValidateUserOpWithArbitraryHashesAndCoordinates(
        bytes32 userOpHash,
        uint256 r,
        uint256 s,
        uint96 missingFunds
    ) public {
        vm.deal(address(account), uint256(missingFunds) + 1 ether);
        PackedUserOperation memory userOp = _buildSignedUserOp(userOpHash, 0x01, r, s);
        _mockRip7212Call(userOp, r, s, 1);

        vm.prank(ENTRY_POINT);
        uint256 validationData = account.validateUserOp(userOp, userOpHash, missingFunds);
        assertEq(validationData, SIG_VALIDATION_SUCCESS);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _emptyUserOp() internal view returns (PackedUserOperation memory) {
        return
            PackedUserOperation({
                sender: address(account),
                nonce: 0,
                initCode: "",
                callData: "",
                accountGasLimits: bytes32(0),
                preVerificationGas: 0,
                gasFees: bytes32(0),
                paymasterAndData: "",
                signature: ""
            });
    }

    function _buildSignedUserOp(
        bytes32 userOpHash,
        bytes1 flagsByte,
        uint256 r,
        uint256 s
    ) internal view returns (PackedUserOperation memory userOp) {
        string memory challengeBase64Url = Base64.encodeURL(abi.encodePacked(userOpHash));

        bytes memory authenticatorData = new bytes(37);
        authenticatorData[32] = flagsByte;

        string memory prefix = '{"type":"webauthn.get","challenge":"';
        string memory suffix = '","origin":"https://anurags0752-cyber.github.io","crossOrigin":false}';
        bytes memory clientDataJSON = abi.encodePacked(prefix, challengeBase64Url, suffix);
        uint256 challengeOffset = bytes(prefix).length;

        userOp = _emptyUserOp();
        userOp.signature = abi.encode(authenticatorData, clientDataJSON, challengeOffset, r, s);
    }

    function _mockRip7212Call(
        PackedUserOperation memory userOp,
        uint256 r,
        uint256 s,
        uint256 returnVal
    ) internal {
        (bytes memory authenticatorData, bytes memory clientDataJSON, , , ) = abi.decode(
            userOp.signature,
            (bytes, bytes, uint256, uint256, uint256)
        );
        bytes32 clientDataHash = sha256(clientDataJSON);
        bytes32 messageHash = sha256(abi.encodePacked(authenticatorData, clientDataHash));

        bytes memory expectedPayload = abi.encode(
            messageHash,
            r,
            s,
            TEST_PUBKEY_X,
            TEST_PUBKEY_Y
        );
        vm.mockCall(RIP7212_PRECOMPILE, expectedPayload, abi.encode(returnVal));
    }
}
