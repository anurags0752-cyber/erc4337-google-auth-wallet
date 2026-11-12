// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PasskeyAccount} from "../src/PasskeyAccount.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";
import {DeployFactory} from "../script/DeployFactory.s.sol";

contract PasskeyAccountFactoryTest is Test {
    PasskeyAccountFactory internal factory;

    function setUp() public {
        factory = new PasskeyAccountFactory();
    }

    function test_GetAddressMatchesDeployedCreate2Address() public {
        bytes32 pubX = bytes32(uint256(0x123456789abcdef));
        bytes32 pubY = bytes32(uint256(0xfedcba987654321));

        address predicted = factory.getAddress(pubX, pubY);
        assertEq(predicted.code.length, 0, "Counterfactual address should have no code before deployment");

        PasskeyAccount deployed = factory.createAccount(pubX, pubY);
        assertEq(address(deployed), predicted, "Deployed address must equal predicted CREATE2 address");
        assertGt(predicted.code.length, 0, "Deployed address must contain PasskeyAccount runtime bytecode");
    }

    function test_CreateAccountIsIdempotentWhenAlreadyDeployed() public {
        bytes32 pubX = bytes32(uint256(0xaaaa));
        bytes32 pubY = bytes32(uint256(0xbbbb));

        PasskeyAccount first = factory.createAccount(pubX, pubY);
        vm.deal(address(first), 3 ether);

        // ERC-4337 requirement: calling createAccount again must not revert and must preserve state/balance
        PasskeyAccount second = factory.createAccount(pubX, pubY);
        assertEq(address(second), address(first));
        assertEq(address(second).balance, 3 ether);
    }

    function test_DifferentPublicKeysProduceDistinctAddresses() public view {
        address addr1 = factory.getAddress(bytes32(uint256(1)), bytes32(uint256(2)));
        address addr2 = factory.getAddress(bytes32(uint256(2)), bytes32(uint256(1)));
        assertTrue(addr1 != addr2, "Swapped (x, y) coordinates must yield distinct CREATE2 addresses");
    }

    function testFuzz_Create2PredictionAlwaysMatchesDeployment(bytes32 x, bytes32 y) public {
        address predicted = factory.getAddress(x, y);
        PasskeyAccount deployed = factory.createAccount(x, y);
        assertEq(address(deployed), predicted);
    }

    function test_DeployFactoryScriptRunsCleanly() public {
        // Set dummy private key in Foundry cheatcode env for script test
        vm.setEnv("PRIVATE_KEY", "1");
        DeployFactory deployer = new DeployFactory();
        PasskeyAccountFactory deployedFactory = deployer.run();
        assertTrue(address(deployedFactory) != address(0));

        address predicted = deployedFactory.getAddress(bytes32(uint256(7)), bytes32(uint256(8)));
        PasskeyAccount acct = deployedFactory.createAccount(bytes32(uint256(7)), bytes32(uint256(8)));
        assertEq(address(acct), predicted);
    }
}

