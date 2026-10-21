// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";

contract DeployFactory is Script {
    function run() external returns (PasskeyAccountFactory) {
        // 1. Grab your deployer wallet's private key from the .env file
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // 2. Instruct Foundry to broadcast the following transactions to the blockchain
        vm.startBroadcast(deployerPrivateKey);

        // 3. Deploy the Factory (This happens exactly once per blockchain)
        PasskeyAccountFactory factory = new PasskeyAccountFactory();

        vm.stopBroadcast();

        // 4. Log the address so you can copy-paste it into React Native
        console.log("Passkey Account Factory deployed at:", address(factory));
        
        return factory;
    }
}