import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const ONE_YEAR = 365 * 24 * 60 * 60;

const CUSDC_PER_CETH = 4_000n;
const INITIAL_CETH_LIQUIDITY = 100n;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const cEth = await deploy("ConfidentialETH", {
    from: deployer,
    log: true,
  });

  const cUsdc = await deploy("ConfidentialUSDC", {
    from: deployer,
    log: true,
  });

  const swap = await deploy("ConfidentialSwap", {
    from: deployer,
    args: [cEth.address, cUsdc.address],
    log: true,
  });

  log(`ConfidentialETH deployed at ${cEth.address}`);
  log(`ConfidentialUSDC deployed at ${cUsdc.address}`);
  log(`ConfidentialSwap deployed at ${swap.address}`);

  const latestBlock = await hre.ethers.provider.getBlock("latest");
  const currentTimestamp = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
  const maxExpiry = (1n << 48n) - 1n;
  const desiredExpiry = BigInt(currentTimestamp + ONE_YEAR);
  const expiry = desiredExpiry > maxExpiry ? maxExpiry : desiredExpiry;

  const deployerSigner = await hre.ethers.getSigner(deployer);

  const cEthContract = await hre.ethers.getContractAt("ConfidentialETH", cEth.address, deployerSigner);
  const cUsdcContract = await hre.ethers.getContractAt("ConfidentialUSDC", cUsdc.address, deployerSigner);

  const setOperatorTxs = [
    await cEthContract.setOperator(swap.address, expiry),
    await cUsdcContract.setOperator(swap.address, expiry),
  ];

  for (const tx of setOperatorTxs) {
    log(`Waiting for setOperator tx ${tx.hash}`);
    await tx.wait();
  }

  if (!hre.fhevm.isMock) {
    await hre.fhevm.initializeCLIApi();
  }

  const cEthLiquidity = INITIAL_CETH_LIQUIDITY;
  const cUsdcLiquidity = cEthLiquidity * CUSDC_PER_CETH;

  const mintTxs = [
    await cEthContract.mint(cEthLiquidity),
    await cUsdcContract.mint(cUsdcLiquidity),
  ];

  for (const tx of mintTxs) {
    log(`Waiting for mint tx ${tx.hash}`);
    await tx.wait();
  }

  const cEthBuffer = await hre.fhevm.createEncryptedInput(cEth.address, deployerSigner.address);
  cEthBuffer.add64(cEthLiquidity);
  const cEthCiphertext = await cEthBuffer.encrypt();
  const cEthFundingTx = await cEthContract
    ["confidentialTransfer(address,bytes32,bytes)"](
      swap.address,
      cEthCiphertext.handles[0],
      cEthCiphertext.inputProof,
    );
  log(`Funding swap with ${cEthLiquidity} cETH. Tx: ${cEthFundingTx.hash}`);
  await cEthFundingTx.wait();

  const cUsdcBuffer = await hre.fhevm.createEncryptedInput(cUsdc.address, deployerSigner.address);
  cUsdcBuffer.add64(cUsdcLiquidity);
  const cUsdcCiphertext = await cUsdcBuffer.encrypt();
  const cUsdcFundingTx = await cUsdcContract
    ["confidentialTransfer(address,bytes32,bytes)"](
      swap.address,
      cUsdcCiphertext.handles[0],
      cUsdcCiphertext.inputProof,
    );
  log(`Funding swap with ${cUsdcLiquidity} cUSDC. Tx: ${cUsdcFundingTx.hash}`);
  await cUsdcFundingTx.wait();
};

export default func;
func.id = "deploy_confidential_swap";
func.tags = ["ConfidentialSwap"];
