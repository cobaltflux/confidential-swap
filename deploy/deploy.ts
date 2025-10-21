import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const ONE_YEAR = 365 * 24 * 60 * 60;

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

  const cEthContract = await hre.ethers.getContractAt("ConfidentialETH", cEth.address);
  const cUsdcContract = await hre.ethers.getContractAt("ConfidentialUSDC", cUsdc.address);

  const setOperatorTxs = [
    await cEthContract.setOperator(swap.address, expiry),
    await cUsdcContract.setOperator(swap.address, expiry),
  ];

  for (const tx of setOperatorTxs) {
    log(`Waiting for setOperator tx ${tx.hash}`);
    await tx.wait();
  }
};

export default func;
func.id = "deploy_confidential_swap";
func.tags = ["ConfidentialSwap"];
