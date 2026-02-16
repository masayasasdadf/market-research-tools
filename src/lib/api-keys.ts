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

export function getApiKeys(): ApiKeys {
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

export function saveApiKeys(keys: ApiKeys): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(keys, null, 2), 'utf-8');
}
