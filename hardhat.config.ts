import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";
import * as dotenv from "dotenv";

import "./tasks/accounts";
import "./tasks/swap";

dotenv.config();

const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";
const MNEMONIC = process.env.MNEMONIC ?? DEFAULT_MNEMONIC;
const PRIVATE_KEY = process.env.PRIVATE_KEY
  ? process.env.PRIVATE_KEY.startsWith("0x")
    ? process.env.PRIVATE_KEY
    : `0x${process.env.PRIVATE_KEY}`
  : undefined;
const INFURA_API_KEY = process.env.INFURA_API_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

const LOCAL_ACCOUNTS = {
  mnemonic: MNEMONIC,
  path: "m/44'/60'/0'/0/",
  count: 10,
};

const SEPOLIA_ACCOUNTS = PRIVATE_KEY && PRIVATE_KEY.length > 2
  ? [PRIVATE_KEY]
  : {
      mnemonic: MNEMONIC,
      path: "m/44'/60'/0'/0/",
      count: 1,
    };

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      accounts: LOCAL_ACCOUNTS,
      chainId: 31337,
    },
    anvil: {
      accounts: LOCAL_ACCOUNTS,
      chainId: 31337,
      url: "http://localhost:8545",
    },
    sepolia: {
      accounts: SEPOLIA_ACCOUNTS,
      chainId: 11155111,
      url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
