import { useState, useMemo } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Contract } from 'ethers';
import type { InterfaceAbi } from 'ethers';
import type { Abi } from 'viem';

import { CONTRACTS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { Header } from './Header';
import '../styles/SwapApp.css';

type TokenKey = 'cEth' | 'cUsdc';
type SwapDirection = 'ceth_to_cusdc' | 'cusdc_to_ceth';

const ZERO_HEX = '0x0000000000000000000000000000000000000000000000000000000000000000';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export function SwapApp() {
  const { address } = useAccount();
  const signer = useEthersSigner();
  const publicClient = usePublicClient();
  const { instance, isLoading: isInstanceLoading, error: instanceError } = useZamaInstance();

  const [cEthAmount, setCEthAmount] = useState('');
  const [cUsdcAmount, setCUsdcAmount] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [decryptedBalances, setDecryptedBalances] = useState<{ cEth?: string; cUsdc?: string }>({});
  const [isDecrypting, setIsDecrypting] = useState<SwapDirection | null>(null);

  const swapConfig = useMemo(() => CONTRACTS.swap, []);

  const { data: rateData } = useQuery({
    queryKey: ['swap-rate'],
    enabled: Boolean(publicClient && swapConfig.address !== ZERO_HEX),
    queryFn: async () => {
      if (!publicClient) {
        throw new Error('Missing public client');
      }

      return publicClient.readContract({
        address: swapConfig.address,
        abi: swapConfig.abi as Abi,
        functionName: 'rate',
      });
    },
  });

  const { data: balances, refetch: refetchBalances, isFetching: isFetchingBalances } = useQuery({
    queryKey: ['balances', address],
    enabled: Boolean(address && publicClient),
    queryFn: async () => {
      if (!publicClient || !address) {
        return {
          cEth: ZERO_HEX,
          cUsdc: ZERO_HEX,
        } as const;
      }

      const [cEthCipher, cUsdcCipher] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.cEth.address,
          abi: CONTRACTS.cEth.abi as Abi,
          functionName: 'confidentialBalanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: CONTRACTS.cUsdc.address,
          abi: CONTRACTS.cUsdc.abi as Abi,
          functionName: 'confidentialBalanceOf',
          args: [address],
        }),
      ]);

      return {
        cEth: cEthCipher as string,
        cUsdc: cUsdcCipher as string,
      };
    },
  });

  const refreshBalances = async () => {
    setDecryptedBalances({});
    await refetchBalances();
  };

  const parseAmount = (value: string) => {
    if (!value.trim()) {
      return null;
    }

    if (!/^\d+$/.test(value.trim())) {
      throw new Error('Amount must be a positive integer');
    }

    const parsed = BigInt(value.trim());
    if (parsed === 0n) {
      throw new Error('Amount must be greater than zero');
    }

    return parsed;
  };

  const requireSigner = async () => {
    const resolvedSigner = await signer;
    if (!resolvedSigner) {
      throw new Error('Connect your wallet to continue');
    }
    return resolvedSigner;
  };

  const handleMint = async (tokenKey: TokenKey) => {
    try {
      setFeedback(null);
      setPendingAction(`mint-${tokenKey}`);
      const amount = parseAmount(tokenKey === 'cEth' ? cEthAmount : cUsdcAmount);
      if (!amount) {
        throw new Error('Enter an amount to mint');
      }

      const resolvedSigner = await requireSigner();
      const contract = new Contract(
        CONTRACTS[tokenKey].address,
        CONTRACTS[tokenKey].abi as InterfaceAbi,
        resolvedSigner,
      );
      const tx = await contract.mint(amount);
      await tx.wait();
      setFeedback({ type: 'success', message: `Minted ${amount.toString()} ${tokenKey === 'cEth' ? 'cETH' : 'cUSDC'}` });
      await refreshBalances();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mint failed';
      setFeedback({ type: 'error', message });
    } finally {
      setPendingAction(null);
    }
  };

  const handleAuthorize = async (tokenKey: TokenKey) => {
    try {
      setFeedback(null);
      setPendingAction(`authorize-${tokenKey}`);

      const resolvedSigner = await requireSigner();
      const contract = new Contract(
        CONTRACTS[tokenKey].address,
        CONTRACTS[tokenKey].abi as InterfaceAbi,
        resolvedSigner,
      );
      const now = Math.floor(Date.now() / 1000);
      const expiry = BigInt(now + ONE_YEAR_SECONDS);
      const maxExpiry = (1n << 48n) - 1n;
      const cappedExpiry = expiry > maxExpiry ? maxExpiry : expiry;

      const tx = await contract.setOperator(CONTRACTS.swap.address, cappedExpiry);
      await tx.wait();
      setFeedback({ type: 'success', message: `Authorized swap contract for ${tokenKey === 'cEth' ? 'cETH' : 'cUSDC'}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operator authorization failed';
      setFeedback({ type: 'error', message });
    } finally {
      setPendingAction(null);
    }
  };

  const encryptAmountForSwap = async (amount: bigint, tokenKey: TokenKey) => {
    if (!instance) {
      throw new Error('Encryption service is not ready');
    }
    if (!address) {
      throw new Error('Connect your wallet to continue');
    }

    const buffer = instance.createEncryptedInput(CONTRACTS[tokenKey].address, CONTRACTS.swap.address);
    buffer.add64(amount);
    const payload = await buffer.encrypt();
    return payload;
  };

  const handleSwap = async (direction: SwapDirection) => {
    try {
      setFeedback(null);
      setPendingAction(`swap-${direction}`);
      const resolvedSigner = await requireSigner();

      const amount = parseAmount(direction === 'ceth_to_cusdc' ? cEthAmount : cUsdcAmount);
      if (!amount) {
        throw new Error('Enter an amount to swap');
      }

      const tokenKey: TokenKey = direction === 'ceth_to_cusdc' ? 'cEth' : 'cUsdc';
      const payload = await encryptAmountForSwap(amount, tokenKey);
      const contract = new Contract(
        swapConfig.address,
        swapConfig.abi as InterfaceAbi,
        resolvedSigner,
      );

      const tx =
        direction === 'ceth_to_cusdc'
          ? await contract.swapCethForCusdc(payload.handles[0], payload.inputProof)
          : await contract.swapCusdcForCeth(payload.handles[0], payload.inputProof);

      await tx.wait();
      setFeedback({ type: 'success', message: 'Swap completed successfully' });
      await refreshBalances();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Swap failed';
      setFeedback({ type: 'error', message });
    } finally {
      setPendingAction(null);
    }
  };

  const directionFromToken = (tokenKey: TokenKey): SwapDirection =>
    tokenKey === 'cEth' ? 'ceth_to_cusdc' : 'cusdc_to_ceth';

  const handleDecryptBalance = async (tokenKey: TokenKey) => {
    if (!instance || !address) {
      setFeedback({ type: 'error', message: 'Connect your wallet and ensure encryption service is ready' });
      return;
    }

    const balanceHandle = balances?.[tokenKey];
    if (!balanceHandle || balanceHandle === ZERO_HEX) {
      setDecryptedBalances((previous) => ({ ...previous, [tokenKey]: '0' }));
      return;
    }

    try {
      setIsDecrypting(directionFromToken(tokenKey));
      const keypair = instance.generateKeypair();

      const startTimestamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACTS[tokenKey].address];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimestamp, durationDays);
      const resolvedSigner = await requireSigner();

      const signature = await resolvedSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const decrypted = await instance.userDecrypt(
        [
          {
            handle: balanceHandle,
            contractAddress: CONTRACTS[tokenKey].address,
          },
        ],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimestamp,
        durationDays
      );

      const result = decrypted[balanceHandle];
      setDecryptedBalances((previous) => ({ ...previous, [tokenKey]: result ?? '0' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to decrypt balance';
      setFeedback({ type: 'error', message });
    } finally {
      setIsDecrypting(null);
    }
  };

  return (
    <div className="swap-app">
      <Header />
      <main className="swap-main">
        <section className="summary-card">
          <h2 className="section-title">Confidential Swap</h2>
          <p className="section-description">
            Swap confidential cETH and cUSDC at a fixed rate without revealing your amounts on-chain.
          </p>
          <div className="summary-stats">
            <div>
              <span className="summary-label">Rate</span>
              <span className="summary-value">
                {rateData ? `1 cETH = ${rateData.toString()} cUSDC` : 'Loading rate...'}
              </span>
            </div>
            <div>
              <span className="summary-label">Encryption</span>
              <span className="summary-value">
                {isInstanceLoading ? 'Connecting...' : instanceError ? 'Unavailable' : 'Ready'}
              </span>
            </div>
          </div>
        </section>

        <section className="balances-section">
          <h3 className="section-subtitle">Your balances</h3>
          <div className="balance-grid">
            {(['cEth', 'cUsdc'] as TokenKey[]).map((tokenKey) => (
              <div key={tokenKey} className="balance-card">
                <header>
                  <span className="token-symbol">{tokenKey === 'cEth' ? 'cETH' : 'cUSDC'}</span>
                  <button
                    className="link-button"
                    onClick={() => handleDecryptBalance(tokenKey)}
                    disabled={!address || !balances || pendingAction !== null || isInstanceLoading}
                  >
                    {isDecrypting === directionFromToken(tokenKey) ? 'Decrypting…' : 'Decrypt'}
                  </button>
                </header>
                <dl>
                  <div>
                    <dt>Encrypted</dt>
                    <dd className="encrypted-value">
                      {isFetchingBalances ? 'Loading…' : balances?.[tokenKey] ?? ZERO_HEX}
                    </dd>
                  </div>
                  <div>
                    <dt>Decrypted</dt>
                    <dd className="decrypted-value">
                      {decryptedBalances[tokenKey] ?? 'Tap decrypt to reveal'}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section className="actions-grid">
          <div className="action-card">
            <h4>cETH actions</h4>
            <label htmlFor="ceth-amount" className="input-label">
              Amount (integer units)
            </label>
            <input
              id="ceth-amount"
              className="input"
              type="number"
              min="0"
              step="1"
              value={cEthAmount}
              onChange={(event) => setCEthAmount(event.target.value)}
              placeholder="Enter amount"
            />
            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => handleMint('cEth')}
                disabled={pendingAction !== null}
              >
                {pendingAction === 'mint-cEth' ? 'Minting…' : 'Mint cETH'}
              </button>
              <button
                className="secondary-button"
                onClick={() => handleAuthorize('cEth')}
                disabled={pendingAction !== null}
              >
                {pendingAction === 'authorize-cEth' ? 'Authorizing…' : 'Authorize swap'}
              </button>
            </div>
            <button
              className="accent-button"
              onClick={() => handleSwap('ceth_to_cusdc')}
              disabled={pendingAction !== null || isInstanceLoading}
            >
              {pendingAction === 'swap-ceth_to_cusdc' ? 'Swapping…' : 'Swap cETH → cUSDC'}
            </button>
          </div>

          <div className="action-card">
            <h4>cUSDC actions</h4>
            <label htmlFor="cusdc-amount" className="input-label">
              Amount (integer units)
            </label>
            <input
              id="cusdc-amount"
              className="input"
              type="number"
              min="0"
              step="1"
              value={cUsdcAmount}
              onChange={(event) => setCUsdcAmount(event.target.value)}
              placeholder="Enter amount"
            />
            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => handleMint('cUsdc')}
                disabled={pendingAction !== null}
              >
                {pendingAction === 'mint-cUsdc' ? 'Minting…' : 'Mint cUSDC'}
              </button>
              <button
                className="secondary-button"
                onClick={() => handleAuthorize('cUsdc')}
                disabled={pendingAction !== null}
              >
                {pendingAction === 'authorize-cUsdc' ? 'Authorizing…' : 'Authorize swap'}
              </button>
            </div>
            <button
              className="accent-button"
              onClick={() => handleSwap('cusdc_to_ceth')}
              disabled={pendingAction !== null || isInstanceLoading}
            >
              {pendingAction === 'swap-cusdc_to_ceth' ? 'Swapping…' : 'Swap cUSDC → cETH'}
            </button>
          </div>
        </section>

        {feedback && (
          <div className={`feedback feedback-${feedback.type}`}>
            {feedback.message}
          </div>
        )}

        {!address && (
          <p className="connect-reminder">Connect your wallet to mint tokens, authorize swaps, and trade confidentially.</p>
        )}
      </main>
    </div>
  );
}
