import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

import type { ConfidentialETH, ConfidentialSwap, ConfidentialUSDC } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

const MAX_OPERATOR_EXPIRY = (1n << 48n) - 1n;

describe("ConfidentialSwap", function () {
  let signers: Signers;
  let cEth: ConfidentialETH;
  let cUsdc: ConfidentialUSDC;
  let swap: ConfidentialSwap;
  let cEthAddress: string;
  let cUsdcAddress: string;
  let swapAddress: string;

  before(async function () {
    const availableSigners = await ethers.getSigners();
    signers = { deployer: availableSigners[0], alice: availableSigners[1], bob: availableSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    const cEthFactory = await ethers.getContractFactory("ConfidentialETH");
    cEth = (await cEthFactory.deploy()) as ConfidentialETH;
    await cEth.waitForDeployment();
    cEthAddress = await cEth.getAddress();

    const cUsdcFactory = await ethers.getContractFactory("ConfidentialUSDC");
    cUsdc = (await cUsdcFactory.deploy()) as ConfidentialUSDC;
    await cUsdc.waitForDeployment();
    cUsdcAddress = await cUsdc.getAddress();

    const swapFactory = await ethers.getContractFactory("ConfidentialSwap");
    swap = (await swapFactory.deploy(cEthAddress, cUsdcAddress)) as ConfidentialSwap;
    await swap.waitForDeployment();
    swapAddress = await swap.getAddress();

    const cusdcLiquidity = 80_000n;
    await cUsdc.connect(signers.deployer).mint(cusdcLiquidity);
    const cusdcBuffer = await fhevm.createEncryptedInput(cUsdcAddress, signers.deployer.address);
    cusdcBuffer.add64(cusdcLiquidity);
    const cusdcCiphertext = await cusdcBuffer.encrypt();
    await cUsdc
      .connect(signers.deployer)
      ["confidentialTransfer(address,bytes32,bytes)"](swapAddress, cusdcCiphertext.handles[0], cusdcCiphertext.inputProof);

    const cethLiquidity = 40n;
    await cEth.connect(signers.deployer).mint(cethLiquidity);
    const cethBuffer = await fhevm.createEncryptedInput(cEthAddress, signers.deployer.address);
    cethBuffer.add64(cethLiquidity);
    const cethCiphertext = await cethBuffer.encrypt();
    await cEth
      .connect(signers.deployer)
      ["confidentialTransfer(address,bytes32,bytes)"](swapAddress, cethCiphertext.handles[0], cethCiphertext.inputProof);
  });

  it("swaps cETH for cUSDC at the fixed rate", async function () {
    const amountToSwap = 5n;
    await cEth.connect(signers.alice).mint(amountToSwap);
    await cEth.connect(signers.alice).setOperator(swapAddress, MAX_OPERATOR_EXPIRY);

    const swapBuffer = await fhevm.createEncryptedInput(cEthAddress, swapAddress);
    swapBuffer.add64(amountToSwap);
    const swapCiphertext = await swapBuffer.encrypt();

    await swap
      .connect(signers.alice)
      .swapCethForCusdc(swapCiphertext.handles[0], swapCiphertext.inputProof);

    const aliceCusdcBalanceEncrypted = await cUsdc.confidentialBalanceOf(signers.alice.address);
    const aliceCusdcBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      aliceCusdcBalanceEncrypted,
      cUsdcAddress,
      signers.alice,
    );
    const rate = await swap.rate();

    expect(aliceCusdcBalance).to.equal(amountToSwap * rate);
  });

  it("swaps cUSDC for cETH at the fixed rate", async function () {
    const amountToSwap = 40_000n;
    await cUsdc.connect(signers.bob).mint(amountToSwap);
    await cUsdc.connect(signers.bob).setOperator(swapAddress, MAX_OPERATOR_EXPIRY);

    const swapBuffer = await fhevm.createEncryptedInput(cUsdcAddress, swapAddress);
    swapBuffer.add64(amountToSwap);
    const swapCiphertext = await swapBuffer.encrypt();

    await swap
      .connect(signers.bob)
      .swapCusdcForCeth(swapCiphertext.handles[0], swapCiphertext.inputProof);

    const bobCethBalanceEncrypted = await cEth.confidentialBalanceOf(signers.bob.address);
    const bobCethBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      bobCethBalanceEncrypted,
      cEthAddress,
      signers.bob,
    );
    const rate = await swap.rate();

    expect(bobCethBalance).to.equal(amountToSwap / rate);
  });
});
