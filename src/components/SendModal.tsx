// src/components/SendModal.tsx
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CHAIN_CONFIG } from '../constants/config';
import { COLORS } from '../constants/theme';
import { SendResult, SendStep } from '../hooks/useWallet';

interface SendModalProps {
  visible: boolean;
  onClose: () => void;
  initialRecipient?: string;
  balanceEth: string;
  ethPriceUsd: number;
  isDeployed: boolean;
  hasBundler: boolean;
  onScanPress: () => void;
  onSend: (params: {
    to: string;
    amountEth: string;
    onStep?: (step: SendStep) => void;
  }) => Promise<SendResult>;
}

const STEP_LABELS: Record<SendStep, string> = {
  idle: '',
  building: '1/3 • Building ERC-4337 UserOp & querying EntryPoint v0.7...',
  signing: '2/3 • Waiting for Hardware Passkey P-256 biometric signature...',
  submitting: '3/3 • Packing RIP-7212 signature & submitting UserOperation...',
  confirmed: 'UserOperation verified & recorded!',
  error: 'Transaction failed',
};

export default function SendModal({
  visible,
  onClose,
  initialRecipient,
  balanceEth,
  ethPriceUsd,
  isDeployed,
  hasBundler,
  onScanPress,
  onSend,
}: SendModalProps) {
  const [recipient, setRecipient] = useState(initialRecipient || '');
  const [amount, setAmount] = useState('0.001');
  const [step, setStep] = useState<SendStep>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    if (initialRecipient) {
      setRecipient(initialRecipient);
    }
  }, [initialRecipient]);

  const handleClose = () => {
    if (step === 'building' || step === 'signing' || step === 'submitting') return;
    setStep('idle');
    setErrorMsg(null);
    setResult(null);
    onClose();
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setRecipient(text.trim());
    }
  };

  const setPercentage = (pct: number) => {
    const bal = Math.max(0, Number(balanceEth || '0'));
    if (bal <= 0) {
      setAmount('0.001');
      return;
    }
    const computed = (bal * pct).toFixed(4);
    setAmount(computed);
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await onSend({
        to: recipient,
        amountEth: amount,
        onStep: (s) => setStep(s),
      });
      setResult(res);
      setStep('confirmed');
    } catch (err: any) {
      setStep('error');
      setErrorMsg(err?.message || 'Failed to sign or submit UserOperation.');
    }
  };

  const handleCopyHash = async (hash: string) => {
    await Clipboard.setStringAsync(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const amountUsd = ((Number(amount) || 0) * ethPriceUsd).toFixed(2);
  const isBusy = step === 'building' || step === 'signing' || step === 'submitting';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.backdrop}
        >
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Send via ERC-4337</Text>
                <Text style={styles.subtitle}>
                  {isDeployed
                    ? 'Smart Account Active • RIP-7212 P-256'
                    : 'Counterfactual • Includes Factory initCode'}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} disabled={isBusy} hitSlop={10}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {result && step === 'confirmed' ? (
              <View style={styles.successContainer}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="checkmark-done" size={38} color={COLORS.success} />
                </View>
                <Text style={styles.successTitle}>
                  {result.mode === 'bundler'
                    ? 'UserOperation Broadcasted!'
                    : 'UserOperation Biometrically Signed!'}
                </Text>
                <Text style={styles.successDesc}>
                  {result.mode === 'bundler'
                    ? 'Your P-256 WebAuthn signature was verified and submitted to the Base Sepolia Bundler.'
                    : 'Canonical EntryPoint v0.7 userOpHash signed with hardware secp256r1 Passkey and packed for RIP-7212 (0x100). Add a Bundler RPC URL in Settings to broadcast on-chain.'}
                </Text>

                <TouchableOpacity
                  style={styles.hashBox}
                  onPress={() => handleCopyHash(result.txHash || result.userOpHash)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.hashLabel}>
                      {result.txHash ? 'Transaction Hash' : 'EntryPoint v0.7 userOpHash'}
                    </Text>
                    <Text style={styles.hashValue} numberOfLines={1} ellipsizeMode="middle">
                      {result.txHash || result.userOpHash}
                    </Text>
                  </View>
                  <Ionicons
                    name={copiedHash ? 'checkmark-circle' : 'copy-outline'}
                    size={18}
                    color={copiedHash ? COLORS.success : COLORS.primary}
                  />
                </TouchableOpacity>

                {result.txHash && (
                  <TouchableOpacity
                    style={styles.explorerBtn}
                    onPress={() =>
                      Linking.openURL(`${CHAIN_CONFIG.explorerUrl}/tx/${result.txHash}`)
                    }
                  >
                    <Ionicons name="open-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.explorerBtnText}>View on BaseScan Explorer</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
                  <Text style={styles.primaryBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Recipient Input */}
                <Text style={styles.inputLabel}>Recipient Address (Base Sepolia)</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    placeholder="0x..."
                    placeholderTextColor={COLORS.textMuted}
                    value={recipient}
                    onChangeText={setRecipient}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isBusy}
                  />
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={handlePaste}
                    disabled={isBusy}
                  >
                    <Text style={styles.pasteText}>Paste</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => {
                      handleClose();
                      onScanPress();
                    }}
                    disabled={isBusy}
                  >
                    <Ionicons name="qr-code-outline" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>

                {/* Amount Input */}
                <View style={styles.amountHeaderRow}>
                  <Text style={styles.inputLabel}>Amount (ETH)</Text>
                  <Text style={styles.balanceHint}>Available: {balanceEth} ETH</Text>
                </View>

                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    placeholder="0.001"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={setAmount}
                    editable={!isBusy}
                  />
                  <Text style={styles.usdPreview}>~${amountUsd} USD</Text>
                </View>

                {/* Quick Amount Pills */}
                <View style={styles.quickPillsRow}>
                  {[
                    { label: '0.001 ETH', action: () => setAmount('0.001') },
                    { label: '25%', action: () => setPercentage(0.25) },
                    { label: '50%', action: () => setPercentage(0.5) },
                    { label: 'MAX', action: () => setPercentage(0.95) },
                  ].map((pill) => (
                    <TouchableOpacity
                      key={pill.label}
                      style={styles.quickPill}
                      onPress={pill.action}
                      disabled={isBusy}
                    >
                      <Text style={styles.quickPillText}>{pill.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Info Row */}
                <View style={styles.metaBox}>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaKey}>Signature Curve</Text>
                    <Text style={styles.metaVal}>secp256r1 (RIP-7212 0x100)</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaKey}>Execution Mode</Text>
                    <Text style={styles.metaVal}>
                      {hasBundler ? 'Live Bundler RPC' : 'EntryPoint Hash + Passkey Sign'}
                    </Text>
                  </View>
                </View>

                {/* Step Progress */}
                {isBusy && (
                  <View style={styles.progressBanner}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={styles.progressText}>{STEP_LABELS[step]}</Text>
                  </View>
                )}

                {/* Error Message */}
                {errorMsg && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}

                {/* Submit Button */}
                <TouchableOpacity
                  style={[styles.primaryBtn, isBusy && styles.btnDisabled]}
                  onPress={handleSubmit}
                  disabled={isBusy}
                  activeOpacity={0.85}
                >
                  <Ionicons name="finger-print" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>
                    {isBusy ? 'Signing UserOp...' : 'Sign & Send with Passkey'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  amountHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  balanceHint: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.iconBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingVertical: 2,
  },
  amountInput: {
    fontSize: 18,
    fontWeight: '700',
  },
  usdPreview: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  iconActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  pasteText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  quickPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickPill: {
    flex: 1,
    backgroundColor: COLORS.iconBg,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  quickPillText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  metaBox: {
    marginTop: 16,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaKey: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  metaVal: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: '600',
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.iconBg,
    padding: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  progressText: {
    color: COLORS.text,
    fontSize: 12,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: 10,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    flex: 1,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 18,
    width: '100%',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  successIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  hashBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.iconBg,
    borderRadius: 12,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 10,
  },
  hashLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  hashValue: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  explorerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  explorerBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },
});

