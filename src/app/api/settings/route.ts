import { NextRequest, NextResponse } from 'next/server';
import { getApiKeys, saveApiKeys, isVercelEnvironment } from '@/lib/api-keys';
import { ApiKeys } from '@/types';

const VALID_KEYS: (keyof ApiKeys)[] = [
  'estatAppId',
  'geminiApiKey',
  'googlePlacesApiKey',
  'googleAdsApiKey',
  'googleAdsDeveloperToken',
  'googleAdsCustomerId',
];

export async function GET() {
  const keys = getApiKeys();
  const isVercel = isVercelEnvironment();
  // マスク処理: APIキーの先頭4文字以外を伏せる
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(keys)) {
    if (value && value.length > 4) {
      masked[key] = value.substring(0, 4) + '****';
    } else {
      masked[key] = value ? '****' : '';
    }
  }
  return NextResponse.json({
    keys: masked,
    hasKeys: Object.values(keys).some(v => v !== ''),
    isVercel,
  });
}

export async function POST(request: NextRequest) {
  // Vercel環境チェックを事前に行う
  if (isVercelEnvironment()) {
    return NextResponse.json(
      {
        error: 'Vercel環境ではUIからのAPI キー保存はできません。Vercelダッシュボードの環境変数に設定してください。',
        isVercel: true,
      },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const currentKeys = getApiKeys();
    const newKeys: ApiKeys = { ...currentKeys };

    // クライアントから送られた変更済みフィールドのみ更新
    for (const [key, value] of Object.entries(body.keys || {})) {
      if (typeof value === 'string' && VALID_KEYS.includes(key as keyof ApiKeys)) {
        newKeys[key as keyof ApiKeys] = value;
      }
    }

    saveApiKeys(newKeys);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'APIキーの保存に失敗しました' }, { status: 500 });
  }
}
