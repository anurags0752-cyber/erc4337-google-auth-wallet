// src/hooks/useWallet.ts
import { Buffer } from 'buffer';
import { useCallback, useEffect, useState } from 'react';
import * as Passkeys from 'react-native-passkeys';
import {
  concatHex,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  pad,
  parseAbiParameters,
  parseEther,
  sha256,
  toHex,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import {
  ACCOUNT_ABI,
  CHAIN_CONFIG,
  CONTRACTS,
  ENTRYPOINT_ABI,
  FACTORY_ABI,
  RP_ID,
} from '../constants/config';
import {
  base64UrlToUint8Array,
  extractPublicKeyCoordinates,
  hexToBase64Url,
  packPasskeySignature,
  parseDERSignature,
  recoverWebAuthnPublicKeyCandidates,
} from '../utils/crypto';
import {
  ActivityItem,
  clearAllWalletStorage,
  loadWalletState,
  QuickContact,
  saveWalletState,
  WalletAccount,
  WalletSettings,
} from '../utils/storage';

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(CHAIN_CONFIG.rpcUrl),
});

export type SendStep = 'idle' | 'building' | 'signing' | 'submitting' | 'confirmed' | 'error';

export interface SendResult {
  userOpHash: `0x${string}`;
  txHash?: `0x${string}`;
  mode: 'bundler' | 'signed-userop';
}

function formatTimestamp(date = new Date()): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');
  return `Today, ${hours}:${mins}`;
}

function packUint128Pair(high: bigint, low: bigint): `0x${string}` {
  const highHex = pad(toHex(high), { size: 16 });
  const lowHex = pad(toHex(low), { size: 16 });
  return concatHex([highHex, lowHex]);
}

export function useWallet() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [knownAccountsCount, setKnownAccountsCount] = useState(0);
  const [balanceEth, setBalanceEth] = useState<string>('0.0000');
  const [ethPriceUsd, setEthPriceUsd] = useState<number>(2500);
  const [isDeployed, setIsDeployed] = useState<boolean>(false);
  const [nonce, setNonce] = useState<bigint>(0n);

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [contacts, setContacts] = useState<QuickContact[]>([]);
  const [settings, setSettings] = useState<WalletSettings>({
    backendUrl: 'https://passkey4337.vercel.app',
    bundlerUrl: '',
    paymasterUrl: '',
  });

  // Hydrate persisted state on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const state = await loadWalletState();
        if (!mounted) return;
        setAccount(state.activeAccount);
        setKnownAccountsCount(Object.keys(state.knownAccounts || {}).length);
        setActivities(state.activities);
        setContacts(state.contacts);
        setSettings(state.settings);
      } finally {
        if (mounted) setIsInitializing(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch live on-chain balance, deployment status, nonce, ETH price, and explorer tx history
  const refreshWalletData = useCallback(
    async (targetAddress?: `0x${string}`) => {
      const addr = targetAddress || account?.address;
      if (!addr) return;

      setIsRefreshing(true);
      try {
        const [rawBalance, bytecode, onChainNonce] = await Promise.all([
          publicClient.getBalance({ address: addr }),
          publicClient.getCode({ address: addr }),
          publicClient
            .readContract({
              address: CONTRACTS.entryPoint,
              abi: ENTRYPOINT_ABI,
              functionName: 'getNonce',
              args: [addr, 0n],
            })
            .catch(() => 0n),
        ]);

        const formattedEth = Number(formatEther(rawBalance)).toFixed(4);
        setBalanceEth(formattedEth);

        const deployed = Boolean(bytecode && bytecode !== '0x' && bytecode.length > 2);
        setIsDeployed(deployed);
        setNonce(onChainNonce);

        // Fetch live ETH price (non-blocking fallback)
        let currentEthPrice = ethPriceUsd;
        try {
          const priceRes = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
          );
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            if (priceData?.ethereum?.usd) {
              currentEthPrice = Number(priceData.ethereum.usd);
              setEthPriceUsd(currentEthPrice);
            }
          }
        } catch {
          // Keep cached ETH price if rate-limited or offline
        }

        // Fetch on-chain transactions from Base Sepolia Blockscout explorer API
        try {
          const txRes = await fetch(
            `${CHAIN_CONFIG.blockscoutApiUrl}?module=account&action=txlist&address=${addr}&page=1&offset=15&sort=desc`
          );
          if (txRes.ok) {
            const txJson = await txRes.json();
            if (Array.isArray(txJson?.result) && txJson.result.length > 0) {
              const state = await loadWalletState();
              const existingIds = new Set(state.activities.map((a) => a.txHash || a.id));
              const newItems: ActivityItem[] = [];

              for (const tx of txJson.result) {
                if (!tx.hash || existingIds.has(tx.hash)) continue;
                const isIncoming = tx.to?.toLowerCase() === addr.toLowerCase();
                const valEth = Number(formatEther(BigInt(tx.value || '0')));
                const valUsd = (valEth * currentEthPrice).toFixed(2);
                const dateObj = tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000) : new Date();
                const shortPeer = isIncoming
                  ? `${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`
                  : `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`;

                newItems.push({
                  id: tx.hash,
                  txHash: tx.hash,
                  type: isIncoming ? 'receive' : 'send',
                  title: isIncoming ? 'Received ETH' : 'Sent ETH',
                  badge: isIncoming ? 'On-Chain' : 'Biometric Verified',
                  subtitle: `${isIncoming ? 'From' : 'To'} ${shortPeer}\nTx: ${tx.hash.slice(0, 10)}...`,
                  amount: `${isIncoming ? '+' : '-'}${valEth.toFixed(4)} ETH`,
                  amountUsd: `$${valUsd}`,
                  status: tx.isError === '0' ? 'Confirmed' : 'Failed',
                  time: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                  timestamp: dateObj.getTime(),
                });
              }

              if (newItems.length > 0) {
                const merged = [...newItems, ...state.activities].sort(
                  (a, b) => b.timestamp - a.timestamp
                );
                await saveWalletState({ activities: merged });
                setActivities(merged);
              }
            }
          }
        } catch {
          // Ignore explorer fetch failure gracefully
        }
      } catch (err) {
        console.warn('Failed to refresh on-chain wallet data:', err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [account?.address, ethPriceUsd]
  );

  useEffect(() => {
    if (account?.address) {
      refreshWalletData(account.address);
    }
  }, [account?.address, refreshWalletData]);

  // Create a brand new Passkey Smart Wallet
  async function createWallet(customUsername?: string) {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const cleanUsername = (customUsername || 'anurag_wallet').trim() || 'anurag_wallet';

      let options: any;
      try {
        const response = await fetch(`${settings.backendUrl}/generate-registration-options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUsername }),
        });
        if (!response.ok) {
          throw new Error(`Backend status ${response.status}`);
        }
        options = await response.json();
      } catch {
        // Serverless fallback if the Express backend is crashed or unreachable
        options = {
          rp: { name: 'ERC4337 Passkey Wallet', id: RP_ID },
          user: {
            id: Buffer.from(cleanUsername).toString('base64url').replace(/=+$/, ''),
            name: cleanUsername,
            displayName: cleanUsername,
          },
          challenge: Buffer.from(`reg-${Date.now()}-${Math.random()}`)
            .toString('base64url')
            .replace(/=+$/, ''),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'preferred',
          },
        };
      }

      const credential = await Passkeys.create(options);

      if (!credential?.response?.attestationObject) {
        throw new Error('Passkey creation was cancelled or returned no attestation object.');
      }

      const { x, y } = extractPublicKeyCoordinates(credential.response.attestationObject);

      const predictedAddress = (await publicClient.readContract({
        address: CONTRACTS.factory,
        abi: FACTORY_ABI,
        functionName: 'getAddress',
        args: [x, y],
      })) as `0x${string}`;

      const newAccount: WalletAccount = {
        address: predictedAddress,
        publicKeyX: x,
        publicKeyY: y,
        credentialId: credential.id,
        username: cleanUsername,
        createdAt: new Date().toISOString(),
      };

      const deviceLinkActivity: ActivityItem = {
        id: `init-${Date.now()}`,
        type: 'system',
        title: 'Passkey Smart Account Ready',
        badge: 'RIP-7212 P-256',
        subtitle: `Registered Hardware Passkey (${cleanUsername})\nCounterfactual Address: ${predictedAddress.slice(0, 8)}...${predictedAddress.slice(-6)}`,
        amount: null,
        amountUsd: null,
        status: 'Activated',
        time: formatTimestamp(),
        timestamp: Date.now(),
      };

      const current = await loadWalletState();
      const updatedKnown = {
        ...current.knownAccounts,
        [credential.id]: newAccount,
      };
      const updatedActivities = [deviceLinkActivity, ...current.activities];

      await saveWalletState({
        activeAccount: newAccount,
        knownAccounts: updatedKnown,
        activities: updatedActivities,
      });

      setAccount(newAccount);
      setKnownAccountsCount(Object.keys(updatedKnown).length);
      setActivities(updatedActivities);

      // Notify backend of registration (non-blocking)
      fetch(`${settings.backendUrl}/verify-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credential,
          publicKeyX: x,
          publicKeyY: y,
          smartAccountAddress: predictedAddress,
          username: cleanUsername,
        }),
      }).catch(() => {});

      await refreshWalletData(predictedAddress);
    } catch (error: any) {
      const msg = error?.message || 'Failed to create Passkey wallet.';
      console.error('Wallet Creation Failed:', error);
      setAuthError(msg);
    } finally {
      setIsAuthenticating(false);
    }
  }

  // Sign in with an existing Passkey on the device
  async function loginWithPasskey() {
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      // Request authentication options from backend or build standard WebAuthn challenge
      let requestOptions: {
        challenge: string;
        rpId: string;
        userVerification?: 'required' | 'preferred' | 'discouraged';
      } = {
        challenge: Buffer.from(`erc4337-login-${Date.now()}`).toString('base64url'),
        rpId: RP_ID,
        userVerification: 'preferred',
      };

      try {
        const res = await fetch(`${settings.backendUrl}/generate-authentication-options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const serverOpts = await res.json();
          if (serverOpts?.challenge) {
            requestOptions = {
              ...serverOpts,
              rpId: serverOpts.rpId || RP_ID,
            };
          }
        }
      } catch {
        // Fallback to local challenge if backend endpoint isn't deployed yet
      }

      const assertion = await Passkeys.get(requestOptions);
      if (!assertion?.id) {
        throw new Error('Passkey sign-in was cancelled.');
      }

      const state = await loadWalletState();
      let matchedAccount: WalletAccount | undefined = state.knownAccounts[assertion.id];

      // Also check backend if not found locally
      if (!matchedAccount) {
        try {
          const verifyRes = await fetch(`${settings.backendUrl}/verify-authentication`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(assertion),
          });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData?.account?.address && verifyData?.account?.publicKeyX) {
              matchedAccount = verifyData.account;
            }
          }
        } catch {
          // Ignore backend lookup error
        }
      }

      // 3. Trustless P-256 ECDSA Public Key Recovery (works even if server crashed & local storage cleared!)
      if (!matchedAccount && assertion.response?.signature) {
        const candidates1 = recoverWebAuthnPublicKeyCandidates({
          authenticatorData: base64UrlToUint8Array(assertion.response.authenticatorData),
          clientDataJSON: base64UrlToUint8Array(assertion.response.clientDataJSON),
          signature: base64UrlToUint8Array(assertion.response.signature),
        });

        // Predict Base Sepolia addresses for both candidate public keys
        const resolvedCandidates = await Promise.all(
          candidates1.map(async (cand) => {
            const addr = (await publicClient.readContract({
              address: CONTRACTS.factory,
              abi: FACTORY_ABI,
              functionName: 'getAddress',
              args: [cand.x, cand.y],
            })) as `0x${string}`;
            const [bal, code, epNonce] = await Promise.all([
              publicClient.getBalance({ address: addr }).catch(() => 0n),
              publicClient.getCode({ address: addr }).catch(() => '0x'),
              publicClient
                .readContract({
                  address: CONTRACTS.entryPoint,
                  abi: ENTRYPOINT_ABI,
                  functionName: 'getNonce',
                  args: [addr, 0n],
                })
                .catch(() => 0n),
            ]);
            const isActiveOnChain =
              bal > 0n || epNonce > 0n || Boolean(code && code !== '0x' && code.length > 2);
            return { ...cand, address: addr, isActiveOnChain };
          })
        );

        const activeCand = resolvedCandidates.find((c) => c.isActiveOnChain);
        let chosen = activeCand;

        // If neither candidate has on-chain state yet, intersect with a 2nd signature to pinpoint exact (x, y)
        if (!chosen && resolvedCandidates.length === 2) {
          try {
            const assertion2 = await Passkeys.get({
              rpId: RP_ID,
              challenge: Buffer.from(`erc4337-verify-key-${Date.now()}`).toString('base64url'),
              allowCredentials: [{ id: assertion.id, type: 'public-key' }],
              userVerification: 'preferred',
            });
            if (assertion2?.response?.signature) {
              const candidates2 = recoverWebAuthnPublicKeyCandidates({
                authenticatorData: base64UrlToUint8Array(assertion2.response.authenticatorData),
                clientDataJSON: base64UrlToUint8Array(assertion2.response.clientDataJSON),
                signature: base64UrlToUint8Array(assertion2.response.signature),
              });
              chosen = resolvedCandidates.find((c1) =>
                candidates2.some(
                  (c2) =>
                    c2.x.toLowerCase() === c1.x.toLowerCase() &&
                    c2.y.toLowerCase() === c1.y.toLowerCase()
                )
              );
            }
          } catch {
            // Fallback to first candidate if second assertion skipped
          }
        }

        if (!chosen && resolvedCandidates.length > 0) {
          chosen = resolvedCandidates[0];
        }

        if (chosen) {
          const decodedHandle = assertion.response.userHandle
            ? Buffer.from(assertion.response.userHandle, 'base64url').toString('utf8')
            : '';
          matchedAccount = {
            address: chosen.address,
            publicKeyX: chosen.x,
            publicKeyY: chosen.y,
            credentialId: assertion.id,
            username: decodedHandle || 'recovered_wallet',
            createdAt: new Date().toISOString(),
          };
        }
      }

      if (!matchedAccount) {
        throw new Error('Could not recover Passkey public key coordinates.');
      }

      const updatedKnown = {
        ...state.knownAccounts,
        [matchedAccount.credentialId]: matchedAccount,
      };
      await saveWalletState({ activeAccount: matchedAccount, knownAccounts: updatedKnown });
      setAccount(matchedAccount);
      await refreshWalletData(matchedAccount.address);
    } catch (error: any) {
      const msg = error?.message || 'Passkey sign-in failed.';
      console.error('Passkey Login Failed:', error);
      setAuthError(msg);
    } finally {
      setIsAuthenticating(false);
    }
  }

  // Build, Biometrically Sign, and Submit an ERC-4337 PackedUserOperation
  async function sendTransaction(params: {
    to: string;
    amountEth: string;
    onStep?: (step: SendStep) => void;
  }): Promise<SendResult> {
    if (!account) {
      throw new Error('No active Passkey wallet found.');
    }

    const cleanTo = params.to.trim();
    if (!isAddress(cleanTo)) {
      throw new Error('Invalid recipient Ethereum / Base address.');
    }

    const parsedValue = Number(params.amountEth);
    if (isNaN(parsedValue) || parsedValue < 0) {
      throw new Error('Please enter a valid ETH amount.');
    }

    const valueWei = parseEther(params.amountEth || '0');
    params.onStep?.('building');

    // 1. Check on-chain deployment & EntryPoint nonce
    const [bytecode, currentNonce, feeData] = await Promise.all([
      publicClient.getCode({ address: account.address }),
      publicClient
        .readContract({
          address: CONTRACTS.entryPoint,
          abi: ENTRYPOINT_ABI,
          functionName: 'getNonce',
          args: [account.address, 0n],
        })
        .catch(() => 0n),
      publicClient.estimateFeesPerGas().catch(() => ({
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      })),
    ]);

    const accountExists = Boolean(bytecode && bytecode !== '0x' && bytecode.length > 2);

    // 2. Construct initCode if the smart account hasn't been deployed yet (Lazy Counterfactual Deployment)
    const factoryData = encodeFunctionData({
      abi: FACTORY_ABI,
      functionName: 'createAccount',
      args: [account.publicKeyX, account.publicKeyY],
    });
    const initCode: `0x${string}` = accountExists
      ? '0x'
      : concatHex([CONTRACTS.factory, factoryData]);

    // 3. Encode PasskeyAccount.execute(dest, value, data)
    const callData = encodeFunctionData({
      abi: ACCOUNT_ABI,
      functionName: 'execute',
      args: [cleanTo as `0x${string}`, valueWei, '0x'],
    });

    let verificationGasLimit = accountExists ? 300_000n : 550_000n;
    let callGasLimit = 120_000n;
    let preVerificationGas = 60_000n;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1_000_000_000n;
    const maxFeePerGas = feeData.maxFeePerGas || 2_000_000_000n;
    let paymasterAndData: `0x${string}` = '0x';

    // Build unpacked UserOp for Bundler / Paymaster JSON-RPC v0.7 calls
    const rpcUserOp: Record<string, string> = {
      sender: account.address,
      nonce: toHex(currentNonce),
      callData,
      callGasLimit: toHex(callGasLimit),
      verificationGasLimit: toHex(verificationGasLimit),
      preVerificationGas: toHex(preVerificationGas),
      maxFeePerGas: toHex(maxFeePerGas),
      maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
      signature: '0x',
    };

    if (!accountExists) {
      rpcUserOp.factory = CONTRACTS.factory;
      rpcUserOp.factoryData = factoryData;
    }

    // 3b. Request Paymaster Sponsorship BEFORE computing userOpHash (since userOpHash covers paymasterAndData)
    if (settings.paymasterUrl.trim()) {
      try {
        const pmRes = await fetch(settings.paymasterUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'pm_sponsorUserOperation',
            params: [rpcUserOp, CONTRACTS.entryPoint],
          }),
        });
        const pmJson = await pmRes.json();
        const pm = pmJson?.result;
        if (pm) {
          if (pm.callGasLimit) {
            callGasLimit = BigInt(pm.callGasLimit);
            rpcUserOp.callGasLimit = pm.callGasLimit;
          }
          if (pm.verificationGasLimit) {
            verificationGasLimit = BigInt(pm.verificationGasLimit);
            rpcUserOp.verificationGasLimit = pm.verificationGasLimit;
          }
          if (pm.preVerificationGas) {
            preVerificationGas = BigInt(pm.preVerificationGas);
            rpcUserOp.preVerificationGas = pm.preVerificationGas;
          }
          if (pm.paymasterAndData && pm.paymasterAndData !== '0x') {
            paymasterAndData = pm.paymasterAndData as `0x${string}`;
            rpcUserOp.paymasterAndData = pm.paymasterAndData;
          } else if (pm.paymaster) {
            const pmVerifGas = BigInt(pm.paymasterVerificationGasLimit || '0x30000');
            const pmPostOpGas = BigInt(pm.paymasterPostOpGasLimit || '0x10000');
            const pmData = (pm.paymasterData || '0x') as `0x${string}`;
            paymasterAndData = concatHex([
              pm.paymaster as `0x${string}`,
              pad(toHex(pmVerifGas), { size: 16 }),
              pad(toHex(pmPostOpGas), { size: 16 }),
              pmData,
            ]);
            rpcUserOp.paymaster = pm.paymaster;
            rpcUserOp.paymasterVerificationGasLimit = toHex(pmVerifGas);
            rpcUserOp.paymasterPostOpGasLimit = toHex(pmPostOpGas);
            rpcUserOp.paymasterData = pmData;
          }
        }
      } catch (pmErr) {
        console.warn('Paymaster sponsorship skipped:', pmErr);
      }
    }

    const accountGasLimits = packUint128Pair(verificationGasLimit, callGasLimit);
    const gasFees = packUint128Pair(maxPriorityFeePerGas, maxFeePerGas);

    const unsignedUserOp = {
      sender: account.address,
      nonce: currentNonce,
      initCode,
      callData,
      accountGasLimits,
      preVerificationGas,
      gasFees,
      paymasterAndData,
      signature: '0x' as `0x${string}`,
    };

    // 4. Query EntryPoint v0.7 on Base Sepolia for the canonical userOpHash
    const userOpHash = (await publicClient.readContract({
      address: CONTRACTS.entryPoint,
      abi: ENTRYPOINT_ABI,
      functionName: 'getUserOpHash',
      args: [unsignedUserOp],
    })) as `0x${string}`;

    // 5. Prompt Hardware Biometric Signature over userOpHash
    params.onStep?.('signing');
    const challengeBase64Url = hexToBase64Url(userOpHash);

    const assertion = await Passkeys.get({
      rpId: RP_ID,
      challenge: challengeBase64Url,
      userVerification: 'preferred',
    });

    if (!assertion?.response?.signature) {
      throw new Error('Biometric Passkey signature was cancelled.');
    }

    const authDataBytes = base64UrlToUint8Array(assertion.response.authenticatorData);
    const clientDataBytes = base64UrlToUint8Array(assertion.response.clientDataJSON);
    const sigBytes = base64UrlToUint8Array(assertion.response.signature);

    // 6. Extract (r, s) from ASN.1 DER and ABI-encode for PasskeyAccount._verification
    const { r, s } = parseDERSignature(sigBytes);
    const packedSignature = packPasskeySignature({
      authenticatorData: authDataBytes,
      clientDataJSON: clientDataBytes,
      userOpHash,
      r,
      s,
    });

    params.onStep?.('submitting');

    // 6b. Verify P-256 signature on-chain against Base Sepolia's RIP-7212 Precompile (0x100)
    const authHex = `0x${Buffer.from(authDataBytes).toString('hex')}` as `0x${string}`;
    const clientDataHash = sha256(clientDataBytes);
    const messageHash = sha256(concatHex([authHex, clientDataHash]));
    const rip7212Input = encodeAbiParameters(
      parseAbiParameters('bytes32, uint256, uint256, bytes32, bytes32'),
      [messageHash, r, s, account.publicKeyX, account.publicKeyY]
    );

    const precompileVerification = await publicClient.call({
      to: CONTRACTS.rip7212Precompile,
      data: rip7212Input,
    });

    const isPrecompileValid =
      precompileVerification.data && BigInt(precompileVerification.data) === 1n;
    if (!isPrecompileValid) {
      throw new Error('On-chain RIP-7212 (0x100) P-256 signature verification failed.');
    }

    let txHash: `0x${string}` | undefined;
    let mode: 'bundler' | 'signed-userop' = 'signed-userop';

    // 7. Submit to ERC-4337 v0.7 Bundler if configured
    const activeBundlerUrl = settings.bundlerUrl.trim();
    if (activeBundlerUrl) {
      rpcUserOp.signature = packedSignature;

      const bundleRes = await fetch(activeBundlerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendUserOperation',
          params: [rpcUserOp, CONTRACTS.entryPoint],
        }),
      });

      const bundleJson = await bundleRes.json();
      if (bundleJson.error) {
        throw new Error(bundleJson.error.message || 'Bundler rejected UserOperation.');
      }

      const returnedUserOpHash = (bundleJson.result || userOpHash) as `0x${string}`;
      mode = 'bundler';

      // Poll briefly for receipt
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const receiptRes = await fetch(activeBundlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_getUserOperationReceipt',
            params: [returnedUserOpHash],
          }),
        });
        const receiptJson = await receiptRes.json();
        if (receiptJson?.result?.receipt?.transactionHash) {
          txHash = receiptJson.result.receipt.transactionHash;
          break;
        }
      }
    }

    // 8. Record activity in persistent history
    const usdAmount = (parsedValue * ethPriceUsd).toFixed(2);
    const shortRecipient = `${cleanTo.slice(0, 6)}...${cleanTo.slice(-4)}`;
    const newActivity: ActivityItem = {
      id: userOpHash,
      userOpHash,
      txHash,
      type: 'send',
      title: 'Sent ETH (ERC-4337)',
      badge: 'Biometric Verified',
      subtitle: `To ${shortRecipient}\nUserOp: ${userOpHash.slice(0, 10)}...${userOpHash.slice(-6)}`,
      amount: `-${parsedValue.toFixed(4)} ETH`,
      amountUsd: `$${usdAmount}`,
      status: mode === 'bundler' ? (txHash ? 'Confirmed' : 'Bundled') : 'Signed (P-256)',
      time: formatTimestamp(),
      timestamp: Date.now(),
    };

    const current = await loadWalletState();
    const updatedActivities = [newActivity, ...current.activities];
    await saveWalletState({ activities: updatedActivities });
    setActivities(updatedActivities);

    params.onStep?.('confirmed');
    refreshWalletData(account.address);

    return {
      userOpHash,
      txHash,
      mode,
    };
  }

  async function addContact(name: string, contactAddress: string) {
    const cleanAddr = contactAddress.trim();
    if (!isAddress(cleanAddr)) {
      throw new Error('Please enter a valid 0x Ethereum address.');
    }
    const newContact: QuickContact = {
      id: `contact-${Date.now()}`,
      name: name.trim() || 'Contact',
      address: cleanAddr as `0x${string}`,
    };
    const current = await loadWalletState();
    const updated = [...current.contacts, newContact];
    await saveWalletState({ contacts: updated });
    setContacts(updated);
  }

  async function removeContact(id: string) {
    const current = await loadWalletState();
    const updated = current.contacts.filter((c) => c.id !== id);
    await saveWalletState({ contacts: updated });
    setContacts(updated);
  }

  async function updateSettings(nextSettings: Partial<WalletSettings>) {
    const state = await saveWalletState({
      settings: { ...settings, ...nextSettings },
    });
    setSettings(state.settings);
  }

  async function signOut() {
    await saveWalletState({ activeAccount: null });
    setAccount(null);
    setAuthError(null);
  }

  async function resetAllData() {
    const fresh = await clearAllWalletStorage();
    setAccount(null);
    setKnownAccountsCount(0);
    setActivities(fresh.activities);
    setContacts(fresh.contacts);
    setSettings(fresh.settings);
    setAuthError(null);
  }

  const balanceUsd = (Number(balanceEth || '0') * ethPriceUsd).toFixed(2);

  return {
    // State
    isInitializing,
    isAuthenticating,
    isRefreshing,
    authError,
    account,
    address: account?.address || null,
    knownAccountsCount,
    balanceEth,
    balanceUsd,
    ethPriceUsd,
    isDeployed,
    nonce,
    activities,
    contacts,
    settings,

    // Actions
    createWallet,
    loginWithPasskey,
    refreshWalletData,
    sendTransaction,
    addContact,
    removeContact,
    updateSettings,
    signOut,
    resetAllData,
    clearAuthError: () => setAuthError(null),
  };
}
