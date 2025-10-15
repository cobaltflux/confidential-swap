// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ConfidentialFungibleToken} from "new-confidential-contracts/token/ConfidentialFungibleToken.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialETH is ConfidentialFungibleToken, SepoliaConfig {
    constructor() ConfidentialFungibleToken("cETH", "cETH", "") {}

    function mint(uint64 amount) public {
        _mint(msg.sender, FHE.asEuint64(amount));
    }
}
