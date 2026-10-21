// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {PasskeyAccount} from "./PasskeyAccount.sol";

contract PasskeyAccountFactory {

    function getAddress(bytes32 publicKey_x, bytes32 publicKey_y) public view returns (address){
        bytes32 salt = keccak256(abi.encodePacked(publicKey_x, publicKey_y));

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff), // 1. CREATE2 prefix identifier
                address(this), // 2. The address of this Factory contract
                salt,          // 3. The unique salt
                keccak256(     // 4. The Keccak256 hash of the contract bytecode + constructor args
                    abi.encodePacked(
                        type(PasskeyAccount).creationCode,
                        abi.encode(publicKey_x, publicKey_y)
                    )
                )
            )
        );

        return address(uint160(uint256(hash)));
    }

    function createAccount(bytes32 publicKey_x, bytes32 publicKey_y) external returns (PasskeyAccount) {
        address predictedAddress = getAddress(publicKey_x, publicKey_y);
        
        // ERC-4337 SAFETY CHECK: 
        // If the account already exists, just return it without reverting.
        if (predictedAddress.code.length > 0) {
            return PasskeyAccount(payable(predictedAddress));
        }
        
        bytes32 salt = keccak256(abi.encodePacked(publicKey_x, publicKey_y));
        
        // The 'new ... {salt: ...}' syntax triggers the CREATE2 opcode in Solidity
        PasskeyAccount newAccount = new PasskeyAccount{salt: salt}(publicKey_x, publicKey_y);
        
        return newAccount;
    }
}