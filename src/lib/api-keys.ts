import { ApiKeys } from '@/types';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), '.api-keys.json');

const DEFAULT_KEYS: ApiKeys = {
  estatAppId: '',
  geminiApiKey: '',
  googlePlacesApiKey: '',
  googleAdsApiKey: '',
  googleAdsDeveloperToken: '',
  googleAdsCustomerId: '',
};

// 環境変数名とApiKeysフィールドのマッピング
const ENV_KEY_MAP: Record<keyof ApiKeys, string> = {
  estatAppId: 'ESTAT_APP_ID',
  geminiApiKey: 'GEMINI_API_KEY',
  googlePlacesApiKey: 'GOOGLE_PLACES_API_KEY',
  googleAdsApiKey: 'GOOGLE_ADS_API_KEY',
  googleAdsDeveloperToken: 'GOOGLE_ADS_DEVELOPER_TOKEN',
  googleAdsCustomerId: 'GOOGLE_ADS_CUSTOMER_ID',
};

function getKeysFromEnv(): ApiKeys {
  const keys: ApiKeys = { ...DEFAULT_KEYS };
  for (const [field, envName] of Object.entries(ENV_KEY_MAP)) {
    const value = process.env[envName];
    if (value) {
      keys[field as keyof ApiKeys] = value;
    }
  }
  return keys;
}

function getKeysFromFile(): ApiKeys {
  if (!existsSync(CONFIG_PATH)) {
    return DEFAULT_KEYS;
  }
  try {
    const data = readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_KEYS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_KEYS;
  }
}

export function getApiKeys(): ApiKeys {
  // 環境変数を優先し、ファイルの値で補完する
  const envKeys = getKeysFromEnv();
  const fileKeys = getKeysFromFile();

  const merged: ApiKeys = { ...DEFAULT_KEYS };
  for (const field of Object.keys(DEFAULT_KEYS) as (keyof ApiKeys)[]) {
    merged[field] = envKeys[field] || fileKeys[field] || '';
  }
  return merged;
}

export function saveApiKeys(keys: ApiKeys): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(keys, null, 2), 'utf-8');
}

export function isVercelEnvironment(): boolean {
  return !!process.env.VERCEL;
}
