import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const TOKEN_MAP = {
  ceth: "ConfidentialETH",
  cusdc: "ConfidentialUSDC",
} as const;

type TokenKey = keyof typeof TOKEN_MAP;

task("swap:addresses", "Prints deployed token and swap addresses").setAction(async function (_: TaskArguments, hre) {
  const cEthDeployment = await hre.deployments.get("ConfidentialETH");
  const cUsdcDeployment = await hre.deployments.get("ConfidentialUSDC");
  const swapDeployment = await hre.deployments.get("ConfidentialSwap");

  console.log(`ConfidentialETH : ${cEthDeployment.address}`);
  console.log(`ConfidentialUSDC: ${cUsdcDeployment.address}`);
  console.log(`ConfidentialSwap: ${swapDeployment.address}`);
});

task("token:mint", "Mints confidential tokens")
  .addParam("token", "Token key: ceth or cusdc")
  .addParam("value", "Amount as integer (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const tokenKey = (taskArguments.token as string).toLowerCase() as TokenKey;
    if (!(tokenKey in TOKEN_MAP)) {
      throw new Error(`Unsupported token '${taskArguments.token}'. Use ceth or cusdc.`);
    }

    const value = BigInt(taskArguments.value);
    if (value <= 0) {
      throw new Error("Mint amount must be greater than zero");
    }

    const deployment = await hre.deployments.get(TOKEN_MAP[tokenKey]);
    const token = await hre.ethers.getContractAt(TOKEN_MAP[tokenKey], deployment.address);

    const tx = await token.mint(value);
    console.log(`Minting ${value} ${tokenKey.toUpperCase()}... tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("token:set-operator", "Authorizes an operator for confidential transfers")
  .addParam("token", "Token key: ceth or cusdc")
  .addParam("operator", "Operator address")
  .addOptionalParam("duration", "Operator validity in seconds", "31536000")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const tokenKey = (taskArguments.token as string).toLowerCase() as TokenKey;
    if (!(tokenKey in TOKEN_MAP)) {
      throw new Error(`Unsupported token '${taskArguments.token}'. Use ceth or cusdc.`);
    }

    const duration = BigInt(taskArguments.duration);
    const operator = taskArguments.operator as string;
    if (!hre.ethers.isAddress(operator)) {
      throw new Error(`Invalid operator address ${operator}`);
    }

    const expiry = BigInt(Math.floor(Date.now() / 1000)) + duration;
    const cappedExpiry = expiry > (1n << 48n) - 1n ? (1n << 48n) - 1n : expiry;

    const deployment = await hre.deployments.get(TOKEN_MAP[tokenKey]);
    const token = await hre.ethers.getContractAt(TOKEN_MAP[tokenKey], deployment.address);

    const tx = await token.setOperator(operator, cappedExpiry);
    console.log(`Setting operator ${operator} on ${tokenKey.toUpperCase()}... tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("swap:ceth-to-cusdc", "Swaps cETH to cUSDC at the fixed rate")
  .addParam("value", "Amount of cETH to swap (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const value = BigInt(taskArguments.value);
    if (value <= 0) {
      throw new Error("Swap amount must be greater than zero");
    }

    await hre.fhevm.initializeCLIApi();

    const [signer] = await hre.ethers.getSigners();
    const swapDeployment = await hre.deployments.get("ConfidentialSwap");
    const swap = await hre.ethers.getContractAt("ConfidentialSwap", swapDeployment.address);
    const cEthDeployment = await hre.deployments.get("ConfidentialETH");

    const buffer = await hre.fhevm.createEncryptedInput(cEthDeployment.address, swapDeployment.address);
    buffer.add64(value);
    const encryption = await buffer.encrypt();

    const tx = await swap.swapCethForCusdc(encryption.handles[0], encryption.inputProof);
    console.log(`Swapping ${value} cETH... tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("swap:cusdc-to-ceth", "Swaps cUSDC to cETH at the fixed rate")
  .addParam("value", "Amount of cUSDC to swap (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const value = BigInt(taskArguments.value);
    if (value <= 0) {
      throw new Error("Swap amount must be greater than zero");
    }

    await hre.fhevm.initializeCLIApi();

    const [signer] = await hre.ethers.getSigners();
    const swapDeployment = await hre.deployments.get("ConfidentialSwap");
    const swap = await hre.ethers.getContractAt("ConfidentialSwap", swapDeployment.address);
    const cUsdcDeployment = await hre.deployments.get("ConfidentialUSDC");

    const buffer = await hre.fhevm.createEncryptedInput(cUsdcDeployment.address, swapDeployment.address);
    buffer.add64(value);
    const encryption = await buffer.encrypt();

    const tx = await swap.swapCusdcForCeth(encryption.handles[0], encryption.inputProof);
    console.log(`Swapping ${value} cUSDC... tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("token:decrypt-balance", "Decrypts the caller balance of a confidential token")
  .addParam("token", "Token key: ceth or cusdc")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const tokenKey = (taskArguments.token as string).toLowerCase() as TokenKey;
    if (!(tokenKey in TOKEN_MAP)) {
      throw new Error(`Unsupported token '${taskArguments.token}'. Use ceth or cusdc.`);
    }

    await hre.fhevm.initializeCLIApi();

    const [signer] = await hre.ethers.getSigners();
    const deployment = await hre.deployments.get(TOKEN_MAP[tokenKey]);
    const token = await hre.ethers.getContractAt(TOKEN_MAP[tokenKey], deployment.address);

    const ciphertext = await token.confidentialBalanceOf(signer.address);
    if (ciphertext === hre.ethers.ZeroHash) {
      console.log("Encrypted balance: 0");
      console.log("Clear balance    : 0");
      return;
    }

    const clearBalance = await hre.fhevm.userDecryptEuint(
      FhevmType.euint64,
      ciphertext,
      deployment.address,
      signer,
    );
    console.log(`Encrypted balance: ${ciphertext}`);
    console.log(`Clear balance    : ${clearBalance}`);
  });
