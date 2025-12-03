// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";

import {ConfidentialETH} from "./ConfidentialETH.sol";
import {ConfidentialUSDC} from "./ConfidentialUSDC.sol";

contract ConfidentialSwap is ZamaEthereumConfig {
    error ConfidentialSwapInvalidAddress();

    ConfidentialETH public immutable cEth;
    ConfidentialUSDC public immutable cUsdc;

    uint64 public constant CUSDC_PER_CETH = 4_000;

    event CethForCusdcSwapped(address indexed account, euint64 inputAmount, euint64 outputAmount);
    event CusdcForCethSwapped(address indexed account, euint64 inputAmount, euint64 outputAmount);

    constructor(address cEthAddress, address cUsdcAddress) {
        if (cEthAddress == address(0) || cUsdcAddress == address(0)) {
            revert ConfidentialSwapInvalidAddress();
        }

        cEth = ConfidentialETH(cEthAddress);
        cUsdc = ConfidentialUSDC(cUsdcAddress);
    }

    function rate() external pure returns (uint64) {
        return CUSDC_PER_CETH;
    }

    function swapCethForCusdc(externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        returns (euint64)
    {
        euint64 transferred = cEth.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);
        euint64 outputAmount = FHE.mul(transferred, CUSDC_PER_CETH);
        FHE.allow(outputAmount, address(this));
        FHE.allow(outputAmount, address(cUsdc));
        euint64 sent = cUsdc.confidentialTransfer(msg.sender, outputAmount);

        emit CethForCusdcSwapped(msg.sender, transferred, sent);
        return sent;
    }

    function swapCusdcForCeth(externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        returns (euint64)
    {
        euint64 transferred = cUsdc.confidentialTransferFrom(msg.sender, address(this), encryptedAmount, inputProof);
        euint64 outputAmount = FHE.div(transferred, CUSDC_PER_CETH);
        FHE.allow(outputAmount, address(this));
        FHE.allow(outputAmount, address(cEth));
        euint64 sent = cEth.confidentialTransfer(msg.sender, outputAmount);

        emit CusdcForCethSwapped(msg.sender, transferred, sent);
        return sent;
    }

    function contractCusdcBalance() external view returns (euint64) {
        return cUsdc.confidentialBalanceOf(address(this));
    }

    function contractCethBalance() external view returns (euint64) {
        return cEth.confidentialBalanceOf(address(this));
    }
}
