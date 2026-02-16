import { NextRequest, NextResponse } from 'next/server';
import { getApiKeys, saveApiKeys, isVercelEnvironment } from '@/lib/api-keys';
import { ApiKeys } from '@/types';

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
  try {
    const body = await request.json();
    const currentKeys = getApiKeys();

    // 値が '****' で終わるフィールドは既存値を保持
    const newKeys: ApiKeys = { ...currentKeys };
    for (const [key, value] of Object.entries(body.keys || {})) {
      if (typeof value === 'string' && !value.endsWith('****') && value !== '') {
        (newKeys as any)[key] = value;
      }
    }

    saveApiKeys(newKeys);
    return NextResponse.json({ success: true });
  } catch (error) {
    const isVercel = isVercelEnvironment();
    if (isVercel) {
      return NextResponse.json(
        {
          error: 'Vercel環境ではUIからのAPI キー保存はできません。Vercelダッシュボードの環境変数に設定してください。',
          isVercel: true,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'APIキーの保存に失敗しました' }, { status: 500 });
  }
}
