// src/components/ReceiveModal.tsx
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { COLORS } from '../constants/theme';

interface ReceiveModalProps {
  visible: boolean;
  onClose: () => void;
  address: string;
}

export default function ReceiveModal({ visible, onClose, address }: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Receive Base Sepolia</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* QR Code Container */}
            <View style={styles.qrContainer}>
              <QRCode
                value={address || '0x0000000000000000000000000000000000000000'}
                size={200}
                color="#000000"
                backgroundColor="#FFFFFF"
              />
            </View>

            {/* Address Display & Copy */}
            <Text style={styles.addressLabel}>Your Passkey Smart Account</Text>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
              <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                {address}
              </Text>
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={18}
                color={copied ? COLORS.success : COLORS.primary}
              />
            </TouchableOpacity>

            {copied && <Text style={styles.copiedText}>Address copied to clipboard!</Text>}
          </TouchableOpacity>
        </TouchableOpacity>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 20,
  },
  addressLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.iconBg,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  addressText: {
    color: COLORS.text,
    fontSize: 13,
    maxWidth: 220,
    fontFamily: 'monospace',
  },
  copiedText: {
    color: COLORS.success,
    fontSize: 12,
    marginTop: 8,
  },
});