# Confidential Swap

Confidential Swap is a Fully Homomorphic Encryption (FHE) enabled decentralized exchange that lets users atomically swap confidential ETH (`cETH`) for confidential USDC (`cUSDC`) at a fixed price of `1 cETH = 4000 cUSDC`. The project demonstrates how Zama's FHEVM protocol can be combined with familiar Ethereum tooling to deliver privacy-preserving financial infrastructure with a production-ready web experience.

## Introduction
- **Privacy-first swapping:** All balances and swap amounts remain encrypted on-chain while settlement is verifiable by anyone.
- **Deterministic pricing:** The protocol enforces a non-configurable 4000:1 conversion rate, making audits and UX deterministic.
- **Complete workflow:** Includes smart contracts, deployment scripts, automated tasks and tests, plus an interactive front-end built on the same artifacts produced during deployment.

## Advantages
- **Regain confidentiality:** Zama FHEVM primitives ensure account balances and swap amounts stay encrypted end-to-end.
- **Predictable execution:** A fixed rate removes slippage and oracle dependencies, simplifying integration with other confidential DeFi flows.
- **Seamless tooling:** Hardhat, Viem and Ethers provide an approachable developer experience without sacrificing security or control.
- **Auditable architecture:** Deterministic pricing, explicit events, and immutable token references make on-chain analysis straightforward despite encrypted values.

## Technology Stack
- **Smart contracts:** Solidity, Hardhat, Zama FHEVM libraries (`FHE`, `SepoliaConfig`).
- **Confidential tokens:** `ConfidentialFungibleToken` primitives for `cETH` and `cUSDC` minting and transfers.
- **Deployment & automation:** Hardhat Deploy scripts under `deploy/`, reusable flows inside `tasks/`, and unit plus integration tests in `test/`.
- **Frontend application:** React + Vite + TypeScript + RainbowKit for wallet onboarding, Viem for reads, and Ethers for writes (located in `app/`).
- **Tooling:** npm workspaces, TypeScript configs, and generated ABI artifacts under `deployments/` (Sepolia and local networks).

## Problems Solved
- **Encrypted token UX:** Demonstrates a reference client that signs encrypted swap proofs while shielding on-chain balances.
- **Developer onboarding:** Offers a ready-to-run FHEVM project with clear environment requirements, scripts, and documentation pointers.
- **Deterministic liquidity:** Eliminates front-running and price manipulation by enforcing a fixed exchange rate hard-coded in the `ConfidentialSwap` contract.
- **Seamless integration:** Shows how to bridge Hardhat deployments with a modern React stack without leaking sensitive information to the browser (no environment variables, no local storage).

## Architecture Overview
- **`contracts/`** – `ConfidentialETH`, `ConfidentialUSDC`, and `ConfidentialSwap` implement encrypted ERC-20 interactions and swap logic. View methods avoid `msg.sender` and instead expose encrypted balances.
- **`deploy/`** – Hardhat Deploy scripts wire token creation, mint bootstrap liquidity, and link the swap contract with token addresses. Scripts load `.env` via `dotenv`, use `process.env.INFURA_API_KEY`, and rely on a private key (never a mnemonic).
- **`tasks/`** – Reusable Hardhat tasks for minting, funding liquidity, and performing encrypted swaps against local or Sepolia networks.
- **`test/`** – Automated tests validate swap math, liquidity accounting, and confidential transfer permissions.
- **`deployments/`** – Network-specific metadata and ABIs. The frontend consumes Sepolia ABIs directly from this directory to guarantee parity with deployed contracts.
- **`app/`** – Production-ready frontend using RainbowKit for wallet connections, Viem for read-only hooks, and Ethers for write transactions. The UI avoids Tailwind, does not rely on environment variables, and operates against Sepolia endpoints only.

## Getting Started
1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Compile contracts**
   ```bash
   npm run compile
   ```

3. **Run tests**
   ```bash
   npm run test
   ```

4. **Start a local FHEVM node** (for iterative development)
   ```bash
   npx hardhat node
   ```

5. **Deploy locally**
   ```bash
   npx hardhat deploy --network localhost
   ```

6. **Launch the frontend**
   ```bash
   cd app
   npm install
   npm run dev
   ```

## Environment & Deployment
- Populate `.env` with `INFURA_API_KEY` plus the private key used for Sepolia deployments. Scripts load them via `import * as dotenv from "dotenv"; dotenv.config();` and access `process.env.INFURA_API_KEY`.
- For Sepolia deployment, ensure contracts are compiled, then run:
  ```bash
  npx hardhat deploy --network sepolia
  ```
- Copy the generated ABIs from `deployments/sepolia` into the frontend before building for production to guarantee ABI alignment.
- Never expose mnemonics; deployments rely exclusively on the private key supplied in `.env`.

## Frontend Usage
- Connect a Sepolia wallet through RainbowKit. The dApp targets publicly reachable endpoints—localhost networks are intentionally unsupported for end users.
- Mint confidential tokens via the provided controls, then submit either `cETH → cUSDC` or `cUSDC → cETH` swaps. The UI constructs encrypted proofs, sends writes through Ethers, and refreshes balances with Viem queries.
- Balances and swap history appear as encrypted payloads that can be decrypted locally by the wallet while remaining opaque on-chain.

## Testing & Quality
- Unit tests cover minting, encrypted transfers, swap events, and rate enforcement.
- Additional Hardhat tasks act as integration smoke tests against deployed networks.
- Frontend workflows can be validated by pointing RainbowKit at Sepolia and exercising both swap directions with test liquidity.

## Future Roadmap
- **Dynamic pricing modules:** Research oracle-fed or governance-controlled exchange rates while preserving confidentiality.
- **Cross-asset expansion:** Introduce more confidential token pairs and multi-hop routing that respects FHE constraints.
- **Advanced analytics:** Provide encrypted volume metrics and privacy-preserving reporting dashboards.
- **Expanded SDK:** Offer TypeScript utilities for third-party integrators to compose encrypted swaps into their own applications.
- **Auditing & security hardening:** Engage external reviews of encrypted proof handling and expand invariant testing coverage.

## Resources
- [Zama FHEVM Documentation](https://docs.zama.ai/fhevm)
- [`docs/zama_llm.md`](docs/zama_llm.md) – Contract integration notes for the FHEVM toolkit.
- [`docs/zama_doc_relayer.md`](docs/zama_doc_relayer.md) – Frontend guidelines for interacting with Zama services.
- [RainbowKit Documentation](https://www.rainbowkit.com/)
- [Viem Documentation](https://viem.sh/)

## License

This project is released under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for the full text.
