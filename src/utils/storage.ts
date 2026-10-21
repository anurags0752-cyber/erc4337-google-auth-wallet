// src/utils/storage.ts
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { DEFAULT_BACKEND_URL, DEFAULT_BUNDLER_URL } from '../constants/config';

export interface WalletAccount {
  address: `0x${string}`;
  publicKeyX: `0x${string}`;
  publicKeyY: `0x${string}`;
  credentialId: string;
  username: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  type: 'send' | 'receive' | 'system';
  title: string;
  badge: string | null;
  subtitle: string;
  amount: string | null;
  amountUsd: string | null;
  status: string;
  time: string;
  timestamp: number;
  txHash?: string;
  userOpHash?: string;
}

export interface QuickContact {
  id: string;
  name: string;
  address: `0x${string}`;
}

export interface WalletSettings {
  backendUrl: string;
  bundlerUrl: string;
  paymasterUrl: string;
}

interface PersistedState {
  activeAccount: WalletAccount | null;
  knownAccounts: Record<string, WalletAccount>; // keyed by credentialId
  activities: ActivityItem[];
  contacts: QuickContact[];
  settings: WalletSettings;
}

const STORAGE_FILENAME = 'erc4337_passkey_wallet_state_v1.json';

const DEFAULT_CONTACTS: QuickContact[] = [
  {
    id: 'vitalik',
    name: 'Vitalik',
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  },
  {
    id: 'burn',
    name: 'Vault',
    address: '0x000000000000000000000000000000000000dEaD',
  },
];

const DEFAULT_STATE: PersistedState = {
  activeAccount: null,
  knownAccounts: {},
  activities: [],
  contacts: DEFAULT_CONTACTS,
  settings: {
    backendUrl: DEFAULT_BACKEND_URL,
    bundlerUrl: DEFAULT_BUNDLER_URL,
    paymasterUrl: '',
  },
};

let memoryCache: PersistedState | null = null;

function getFileUri(): string | null {
  if (!FileSystem.documentDirectory) return null;
  return `${FileSystem.documentDirectory}${STORAGE_FILENAME}`;
}

export async function loadWalletState(): Promise<PersistedState> {
  if (memoryCache) return memoryCache;

  try {
    if (Platform.OS === 'web') {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_FILENAME) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        memoryCache = {
          ...DEFAULT_STATE,
          ...parsed,
          settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
        };
        return memoryCache!;
      }
    } else {
      const uri = getFileUri();
      if (uri) {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(uri);
          const parsed = JSON.parse(raw);
          memoryCache = {
            ...DEFAULT_STATE,
            ...parsed,
            settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
          };
          return memoryCache!;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load wallet state from storage:', err);
  }

  memoryCache = { ...DEFAULT_STATE };
  return memoryCache;
}

export async function saveWalletState(partial: Partial<PersistedState>): Promise<PersistedState> {
  const current = await loadWalletState();
  const next: PersistedState = {
    ...current,
    ...partial,
    settings: partial.settings ? { ...current.settings, ...partial.settings } : current.settings,
  };
  memoryCache = next;

  try {
    const serialized = JSON.stringify(next);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_FILENAME, serialized);
      }
    } else {
      const uri = getFileUri();
      if (uri) {
        await FileSystem.writeAsStringAsync(uri, serialized);
      }
    }
  } catch (err) {
    console.warn('Failed to write wallet state to storage:', err);
  }

  return next;
}

export async function clearAllWalletStorage(): Promise<PersistedState> {
  memoryCache = { ...DEFAULT_STATE };
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_FILENAME);
      }
    } else {
      const uri = getFileUri();
      if (uri) {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to clear wallet storage:', err);
  }
  return memoryCache;
}

