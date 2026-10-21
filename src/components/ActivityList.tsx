// src/components/ActivityList.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CHAIN_CONFIG } from '../constants/config';
import { COLORS } from '../constants/theme';
import { ActivityItem } from '../utils/storage';

const FILTERS = ['All', 'Send', 'Receive', 'System'] as const;

interface ActivityListProps {
  activities: ActivityItem[];
  address: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

function getVisualsForType(type: ActivityItem['type']) {
  switch (type) {
    case 'receive':
      return { icon: 'arrow-down-outline', color: COLORS.success };
    case 'send':
      return { icon: 'arrow-up-outline', color: COLORS.primary };
    case 'system':
    default:
      return { icon: 'finger-print-outline', color: '#6366F1' };
  }
}

export default function ActivityList({
  activities,
  address,
  isRefreshing = false,
  onRefresh,
}: ActivityListProps) {
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredActivities = activities.filter((item) => {
    if (activeFilter === 'All') return true;
    return item.type === activeFilter.toLowerCase();
  });

  const handleCardPress = async (item: ActivityItem) => {
    if (item.txHash) {
      Linking.openURL(`${CHAIN_CONFIG.explorerUrl}/tx/${item.txHash}`);
    } else if (item.userOpHash) {
      await Clipboard.setStringAsync(item.userOpHash);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        ) : undefined
      }
    >
      {/* Filter Tabs + Explorer Shortcut */}
      <View style={styles.topRow}>
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[styles.filterPill, activeFilter === filter && styles.filterPillActive]}
            >
              <Text style={[styles.filterText, activeFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {filteredActivities.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={36} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No {activeFilter !== 'All' ? activeFilter : ''} Activity Yet</Text>
          <Text style={styles.emptySubtitle}>
            Sign an ERC-4337 UserOperation or fund your counterfactual account on Base Sepolia to see live events here.
          </Text>
          <TouchableOpacity
            style={styles.explorerBtn}
            onPress={() => Linking.openURL(`${CHAIN_CONFIG.explorerUrl}/address/${address}`)}
          >
            <Ionicons name="open-outline" size={14} color={COLORS.primary} />
            <Text style={styles.explorerBtnText}>View Account on BaseScan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        filteredActivities.map((item) => {
          const visuals = getVisualsForType(item.type);
          const isCopied = copiedId === item.id;

          return (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => handleCardPress(item)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                  <View style={[styles.iconBox, { backgroundColor: visuals.color + '20' }]}>
                    <Ionicons name={visuals.icon as any} size={18} color={visuals.color} />
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                </View>
                {item.badge && (
                  <View style={styles.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={12} color={COLORS.primary} />
                    <Text style={styles.verifiedText}>{item.badge}</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                {item.amount && (
                  <View style={styles.amountBox}>
                    <Text style={[styles.amountText, { color: visuals.color }]}>{item.amount}</Text>
                    {item.amountUsd && <Text style={styles.amountUsd}>{item.amountUsd}</Text>}
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.statusBox}>
                  <View style={[styles.statusDot, { backgroundColor: visuals.color }]} />
                  <Text style={styles.statusText}>
                    {isCopied ? 'Copied UserOp Hash!' : item.status}
                  </Text>
                </View>
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{item.time}</Text>
                  {item.txHash ? (
                    <Ionicons name="open-outline" size={12} color={COLORS.textMuted} />
                  ) : item.userOpHash ? (
                    <Ionicons name="copy-outline" size={12} color={COLORS.textMuted} />
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 110 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  filterPillActive: {
    backgroundColor: COLORS.iconBg,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginTop: 12,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
  explorerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: COLORS.iconBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  explorerBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.iconBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  verifiedText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  cardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  cardSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  amountBox: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  amountUsd: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingTop: 10,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
});
