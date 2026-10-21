// src/app/index.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ActivityList from '../components/ActivityList';
import ReceiveModal from '../components/ReceiveModal';
import SendModal from '../components/SendModal';
import SettingsView from '../components/SettingsView';
import { COLORS } from '../constants/theme';
import { useWallet } from '../hooks/useWallet';

export default function HomeScreen() {
  const router = useRouter();
  const { recipientAddress } = useLocalSearchParams<{ recipientAddress?: string }>();
  const {
    isInitializing,
    isAuthenticating,
    isRefreshing,
    authError,
    account,
    address,
    balanceEth,
    balanceUsd,
    ethPriceUsd,
    isDeployed,
    nonce,
    activities,
    contacts,
    settings,
    createWallet,
    loginWithPasskey,
    refreshWalletData,
    sendTransaction,
    addContact,
    removeContact,
    updateSettings,
    signOut,
    resetAllData,
    clearAuthError,
  } = useWallet();

  const [usernameInput, setUsernameInput] = useState('anurag_wallet');
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'settings'>('home');
  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [sendModalVisible, setSendModalVisible] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Add Contact Modal state
  const [addContactVisible, setAddContactVisible] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactAddr, setNewContactAddr] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);

  // When routed back from QR scanner with recipientAddress, open SendModal automatically
  useEffect(() => {
    if (recipientAddress && address) {
      setSelectedRecipient(recipientAddress);
      setSendModalVisible(true);
    }
  }, [recipientAddress, address]);

  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '0xBBC8...57fF';

  const copyAddress = async () => {
    if (address) {
      await Clipboard.setStringAsync(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenSend = (prefillAddress = '') => {
    setSelectedRecipient(prefillAddress);
    setSendModalVisible(true);
  };

  const handleSaveContact = async () => {
    setContactError(null);
    try {
      await addContact(newContactName, newContactAddr);
      setNewContactName('');
      setNewContactAddr('');
      setAddContactVisible(false);
    } catch (err: any) {
      setContactError(err?.message || 'Invalid contact address.');
    }
  };

  if (isInitializing) {
    return (
      <SafeAreaView style={styles.onboardingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // State 1: Onboarding (Create or Sign In with Passkey)
  if (!address || !account) {
    return (
      <SafeAreaView style={styles.onboardingContainer}>
        <View style={styles.onboardingContent}>
          <View style={styles.shieldIconBox}>
            <Ionicons name="finger-print" size={60} color={COLORS.primary} />
          </View>
          <View style={styles.protocolChip}>
            <Text style={styles.protocolChipText}>ERC-4337 v0.7 • RIP-7212 (0x100)</Text>
          </View>
          <Text style={styles.onboardingTitle}>Keyless Web3 Wallet</Text>
          <Text style={styles.onboardingSubtitle}>
            Hardware-enclave secp256r1 Passkeys synced with Google Credential Manager & Account Abstraction on Base Sepolia.
          </Text>

          {/* Username / Handle Input */}
          <View style={styles.usernameBox}>
            <Ionicons name="at" size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.usernameInput}
              placeholder="wallet_username"
              placeholderTextColor={COLORS.textMuted}
              value={usernameInput}
              onChangeText={(t) => {
                setUsernameInput(t);
                if (authError) clearAuthError();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isAuthenticating}
            />
          </View>

          {authError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.createButton, isAuthenticating && styles.disabledBtn]}
            onPress={() => createWallet(usernameInput)}
            disabled={isAuthenticating}
            activeOpacity={0.85}
          >
            {isAuthenticating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="hardware-chip-outline" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.createButtonText}>
              {isAuthenticating ? 'Waiting for Biometrics...' : 'Create with Passkey'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={loginWithPasskey}
            disabled={isAuthenticating}
            activeOpacity={0.8}
          >
            <Ionicons name="key-outline" size={18} color={COLORS.primary} />
            <Text style={styles.loginButtonText}>Sign In with Existing Passkey</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // State 2: Authenticated Smart Wallet Dashboard
  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.networkBadge}>Base Sepolia Testnet • Chain 84532</Text>
          <View style={styles.walletStatusRow}>
            <View style={styles.activeDot} />
            <Text style={styles.walletTitle}>@{account.username}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => refreshWalletData()}
            disabled={isRefreshing}
          >
            <Ionicons
              name="refresh"
              size={17}
              color={isRefreshing ? COLORS.primary : COLORS.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => setActiveTab('settings')}
          >
            <Ionicons name="person-outline" size={17} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Tab Switcher */}
      {activeTab === 'home' ? (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => refreshWalletData()}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Main Balance Card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Total Smart Account Balance</Text>
            <Text style={styles.balanceValue}>{balanceEth} ETH</Text>
            <Text style={styles.balanceUsd}>~${balanceUsd} USD</Text>

            {/* Address Pill */}
            <TouchableOpacity style={styles.addressPill} onPress={copyAddress} activeOpacity={0.7}>
              <Text style={styles.addressText}>{displayAddress}</Text>
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={14}
                color={copied ? COLORS.success : COLORS.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.badgeRow}>
              <Ionicons
                name={isDeployed ? 'shield-checkmark' : 'sparkles-outline'}
                size={12}
                color={isDeployed ? COLORS.success : COLORS.primary}
              />
              <Text style={styles.badgeText}>
                {isDeployed
                  ? `Deployed on Base • Nonce #${nonce.toString()}`
                  : 'Counterfactual CREATE2 Ready • RIP-7212 P-256'}
              </Text>
            </View>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            {/* Send */}
            <View style={styles.actionItem}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleOpenSend(recipientAddress || '')}
              >
                <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Send</Text>
            </View>

            {/* Receive */}
            <View style={styles.actionItem}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setReceiveModalVisible(true)}
              >
                <Ionicons name="download" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Receive</Text>
            </View>

            {/* Scan QR */}
            <View style={styles.actionItem}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push('/scan')}
              >
                <Ionicons name="qr-code" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Scan QR</Text>
            </View>

            {/* Activity History */}
            <View style={styles.actionItem}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => setActiveTab('history')}
              >
                <Ionicons name="list" size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <Text style={styles.actionLabel}>Activity</Text>
            </View>
          </View>

          {/* Scanned Parameter Notice */}
          {recipientAddress && (
            <TouchableOpacity
              style={styles.scannedBanner}
              onPress={() => handleOpenSend(recipientAddress)}
            >
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.scannedBannerText} numberOfLines={1}>
                Scanned Target: {recipientAddress} (Tap to Send)
              </Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          )}

          {/* Quick Send Contacts Section */}
          <View style={styles.quickSendSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Quick Send</Text>
              <Text style={styles.sectionHint}>Long-press to remove</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickSendRow}
            >
              {contacts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.contactItem}
                  onPress={() => handleOpenSend(c.address)}
                  onLongPress={() => removeContact(c.id)}
                >
                  <View style={styles.contactAvatar}>
                    <Text style={styles.contactInitials}>
                      {c.name.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.contactName} numberOfLines={1}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.contactItem}
                onPress={() => setAddContactVisible(true)}
              >
                <View style={styles.quickSendAdd}>
                  <Ionicons name="add" size={22} color={COLORS.primary} />
                </View>
                <Text style={styles.contactName}>Add New</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Recent Activity Preview */}
          <View style={styles.recentSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity onPress={() => setActiveTab('history')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            {activities.slice(0, 2).map((act) => (
              <TouchableOpacity
                key={act.id}
                style={styles.recentCard}
                onPress={() => setActiveTab('history')}
              >
                <View style={styles.recentIcon}>
                  <Ionicons
                    name={
                      act.type === 'send'
                        ? 'arrow-up-outline'
                        : act.type === 'receive'
                          ? 'arrow-down-outline'
                          : 'finger-print-outline'
                    }
                    size={16}
                    color={act.type === 'receive' ? COLORS.success : COLORS.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentTitle}>{act.title}</Text>
                  <Text style={styles.recentSub} numberOfLines={1}>
                    {act.subtitle.replace('\n', ' • ')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {act.amount && <Text style={styles.recentAmt}>{act.amount}</Text>}
                  <Text style={styles.recentStatus}>{act.status}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : activeTab === 'history' ? (
        <ActivityList
          activities={activities}
          address={address}
          isRefreshing={isRefreshing}
          onRefresh={() => refreshWalletData()}
        />
      ) : (
        <SettingsView
          account={account}
          isDeployed={isDeployed}
          nonce={nonce}
          settings={settings}
          onSaveSettings={updateSettings}
          onSignOut={signOut}
          onResetAll={resetAllData}
        />
      )}

      {/* Floating Bottom Navigation Bar */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('home')}>
          <Ionicons
            name={activeTab === 'home' ? 'home' : 'home-outline'}
            size={22}
            color={activeTab === 'home' ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.navText, activeTab === 'home' && styles.navTextActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('history')}>
          <Ionicons
            name={activeTab === 'history' ? 'time' : 'time-outline'}
            size={22}
            color={activeTab === 'history' ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.navText, activeTab === 'history' && styles.navTextActive]}>
            History
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('settings')}>
          <Ionicons
            name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
            size={22}
            color={activeTab === 'settings' ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.navText, activeTab === 'settings' && styles.navTextActive]}>
            Settings
          </Text>
        </TouchableOpacity>
      </View>

      {/* Receive QR Modal */}
      <ReceiveModal
        visible={receiveModalVisible}
        onClose={() => setReceiveModalVisible(false)}
        address={address}
      />

      {/* Send ERC-4337 Transaction Modal */}
      <SendModal
        visible={sendModalVisible}
        onClose={() => setSendModalVisible(false)}
        initialRecipient={selectedRecipient}
        balanceEth={balanceEth}
        ethPriceUsd={ethPriceUsd}
        isDeployed={isDeployed}
        hasBundler={Boolean(settings.bundlerUrl.trim())}
        onScanPress={() => router.push('/scan')}
        onSend={sendTransaction}
      />

      {/* Add Quick Send Contact Modal */}
      <Modal
        visible={addContactVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddContactVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.modalTitle}>Add Quick Send Contact</Text>
              <TouchableOpacity onPress={() => setAddContactVisible(false)}>
                <Ionicons name="close" size={22} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Name (e.g. Alice)"
              placeholderTextColor={COLORS.textMuted}
              value={newContactName}
              onChangeText={setNewContactName}
            />
            <TextInput
              style={[styles.modalInput, { marginTop: 10 }]}
              placeholder="0x... Base / Ethereum Address"
              placeholderTextColor={COLORS.textMuted}
              value={newContactAddr}
              onChangeText={setNewContactAddr}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {contactError && <Text style={styles.contactErrorText}>{contactError}</Text>}
            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveContact}>
              <Text style={styles.modalSaveBtnText}>Save Contact</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollArea: { flex: 1 },
  onboardingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  onboardingContent: { alignItems: 'center', width: '100%', maxWidth: 340 },
  shieldIconBox: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  protocolChip: {
    backgroundColor: COLORS.iconBg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    marginBottom: 12,
  },
  protocolChipText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  onboardingSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },
  usernameBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    gap: 8,
  },
  usernameInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    width: '100%',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    flex: 1,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 30,
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  createButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    width: '100%',
    borderRadius: 30,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  loginButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  networkBadge: { color: COLORS.textMuted, fontSize: 11, fontWeight: '500' },
  walletStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  walletTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { paddingHorizontal: 20, paddingBottom: 115 },
  balanceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 24,
  },
  balanceLabel: { color: COLORS.textMuted, fontSize: 12 },
  balanceValue: { color: COLORS.text, fontSize: 32, fontWeight: '800', marginTop: 4 },
  balanceUsd: { color: COLORS.textMuted, fontSize: 13, marginTop: 2 },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.iconBg,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  addressText: {
    color: COLORS.text,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  badgeText: { color: COLORS.textMuted, fontSize: 11 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  actionItem: { alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: { color: COLORS.text, fontSize: 12, fontWeight: '500' },
  scannedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginBottom: 20,
  },
  scannedBannerText: { color: COLORS.text, fontSize: 12, flex: 1 },
  quickSendSection: { marginTop: 4 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  sectionHint: { color: COLORS.textMuted, fontSize: 11 },
  seeAllText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  quickSendRow: { flexDirection: 'row', gap: 14, paddingBottom: 4 },
  contactItem: { alignItems: 'center', width: 62, gap: 6 },
  contactAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.iconBg,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInitials: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  contactName: { color: COLORS.textMuted, fontSize: 11, fontWeight: '500' },
  quickSendAdd: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentSection: { marginTop: 22 },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 10,
  },
  recentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.iconBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentTitle: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  recentSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  recentAmt: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  recentStatus: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  bottomNav: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(18, 23, 34, 0.96)',
    borderRadius: 32,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  navItem: { alignItems: 'center', gap: 2 },
  navText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '500' },
  navTextActive: { color: COLORS.primary, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  modalInput: {
    backgroundColor: COLORS.iconBg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 13,
  },
  contactErrorText: { color: COLORS.danger, fontSize: 12, marginTop: 8 },
  modalSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  modalSaveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});