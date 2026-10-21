// src/components/SettingsView.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CHAIN_CONFIG, CONTRACTS } from '../constants/config';
import { COLORS } from '../constants/theme';
import { WalletAccount, WalletSettings } from '../utils/storage';

interface SettingsViewProps {
  account: WalletAccount;
  isDeployed: boolean;
  nonce: bigint;
  settings: WalletSettings;
  onSaveSettings: (next: Partial<WalletSettings>) => Promise<void>;
  onSignOut: () => Promise<void>;
  onResetAll: () => Promise<void>;
}

export default function SettingsView({
  account,
  isDeployed,
  nonce,
  settings,
  onSaveSettings,
  onSignOut,
  onResetAll,
}: SettingsViewProps) {
  const [bundlerUrl, setBundlerUrl] = useState(settings.bundlerUrl);
  const [paymasterUrl, setPaymasterUrl] = useState(settings.paymasterUrl);
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [savedToast, setSavedToast] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyItem = async (key: string, val: string) => {
    await Clipboard.setStringAsync(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleSave = async () => {
    await onSaveSettings({
      bundlerUrl: bundlerUrl.trim(),
      paymasterUrl: paymasterUrl.trim(),
      backendUrl: backendUrl.trim() || 'https://passkey4337.vercel.app',
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2200);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Smart Account Cryptographic Identity */}
      <Text style={styles.sectionHeader}>Passkey Smart Account (RIP-7212)</Text>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Passkey Handle</Text>
          <Text style={styles.valueBold}>@{account.username}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Contract State</Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: isDeployed ? 'rgba(16, 185, 129, 0.15)' : COLORS.iconBg },
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: isDeployed ? COLORS.success : COLORS.primary },
              ]}
            />
            <Text
              style={[
                styles.badgeText,
                { color: isDeployed ? COLORS.success : COLORS.primary },
              ]}
            >
              {isDeployed ? 'Deployed on Base Sepolia' : 'Counterfactual (CREATE2)'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.rowBetween}>
          <Text style={styles.label}>EntryPoint v0.7 Nonce</Text>
          <Text style={styles.valueMono}>{nonce.toString()}</Text>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.copyRow}
          onPress={() => copyItem('pubX', account.publicKeyX)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>P-256 Public Key X (COSE -2)</Text>
            <Text style={styles.valueMonoSmall} numberOfLines={1} ellipsizeMode="middle">
              {account.publicKeyX}
            </Text>
          </View>
          <Ionicons
            name={copiedKey === 'pubX' ? 'checkmark-circle' : 'copy-outline'}
            size={16}
            color={copiedKey === 'pubX' ? COLORS.success : COLORS.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.copyRow}
          onPress={() => copyItem('pubY', account.publicKeyY)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>P-256 Public Key Y (COSE -3)</Text>
            <Text style={styles.valueMonoSmall} numberOfLines={1} ellipsizeMode="middle">
              {account.publicKeyY}
            </Text>
          </View>
          <Ionicons
            name={copiedKey === 'pubY' ? 'checkmark-circle' : 'copy-outline'}
            size={16}
            color={copiedKey === 'pubY' ? COLORS.success : COLORS.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* ERC-4337 Bundler & Paymaster Configuration */}
      <Text style={styles.sectionHeader}>ERC-4337 Bundler & Infrastructure</Text>
      <View style={styles.card}>
        <Text style={styles.inputLabel}>Bundler RPC URL (Base Sepolia v0.7)</Text>
        <TextInput
          style={styles.input}
          placeholder="https://api.pimlico.io/v2/84532/rpc?apikey=..."
          placeholderTextColor={COLORS.textMuted}
          value={bundlerUrl}
          onChangeText={setBundlerUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.inputLabel, { marginTop: 12 }]}>
          Paymaster RPC URL (Optional Gas Sponsorship)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Optional pm_sponsorUserOperation endpoint"
          placeholderTextColor={COLORS.textMuted}
          value={paymasterUrl}
          onChangeText={setPaymasterUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={[styles.inputLabel, { marginTop: 12 }]}>SimpleWebAuthn Backend URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://passkey4337.vercel.app"
          placeholderTextColor={COLORS.textMuted}
          value={backendUrl}
          onChangeText={setBackendUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
          <Ionicons
            name={savedToast ? 'checkmark-circle' : 'save-outline'}
            size={18}
            color="#FFFFFF"
          />
          <Text style={styles.saveBtnText}>
            {savedToast ? 'Configuration Saved!' : 'Save RPC Configuration'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Verified On-Chain Contracts */}
      <Text style={styles.sectionHeader}>On-Chain Contracts & Tools</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL(`${CHAIN_CONFIG.explorerUrl}/address/${account.address}`)}
        >
          <View style={styles.linkLeft}>
            <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
            <Text style={styles.linkText}>View Smart Wallet on BaseScan</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() =>
            Linking.openURL(`${CHAIN_CONFIG.explorerUrl}/address/${CONTRACTS.factory}`)
          }
        >
          <View style={styles.linkLeft}>
            <Ionicons name="cube-outline" size={18} color={COLORS.primary} />
            <View>
              <Text style={styles.linkText}>PasskeyAccountFactory</Text>
              <Text style={styles.subMono}>{CONTRACTS.factory}</Text>
            </View>
          </View>
          <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() =>
            Linking.openURL(`${CHAIN_CONFIG.explorerUrl}/address/${CONTRACTS.entryPoint}`)
          }
        >
          <View style={styles.linkLeft}>
            <Ionicons name="layers-outline" size={18} color={COLORS.primary} />
            <View>
              <Text style={styles.linkText}>ERC-4337 EntryPoint v0.7</Text>
              <Text style={styles.subMono}>{CONTRACTS.entryPoint}</Text>
            </View>
          </View>
          <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL(CHAIN_CONFIG.faucetUrl)}
        >
          <View style={styles.linkLeft}>
            <Ionicons name="water-outline" size={18} color={COLORS.success} />
            <Text style={styles.linkText}>Get Base Sepolia Testnet ETH (Faucet)</Text>
          </View>
          <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Session Actions */}
      <View style={styles.sessionRow}>
        <TouchableOpacity style={styles.lockBtn} onPress={onSignOut}>
          <Ionicons name="lock-closed-outline" size={18} color={COLORS.text} />
          <Text style={styles.lockBtnText}>Lock Session</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.resetBtn} onPress={onResetAll}>
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
          <Text style={styles.resetBtnText}>Clear Local Cache</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 120 },
  sectionHeader: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 6,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 20,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  copyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 12,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  valueBold: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  valueMono: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  valueMonoSmall: {
    color: COLORS.text,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  inputLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.iconBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  linkText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  subMono: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  sessionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  lockBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 14,
    paddingVertical: 13,
  },
  lockBtnText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  resetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 14,
    paddingVertical: 13,
  },
  resetBtnText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});

