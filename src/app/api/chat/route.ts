import { NextRequest, NextResponse } from 'next/server';
import { getApiKeys } from '@/lib/api-keys';
import { analyzeQuery } from '@/lib/analyzer';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'メッセージを入力してください' }, { status: 400 });
    }

    const keys = getApiKeys();

    if (!keys.geminiApiKey) {
      return NextResponse.json({
        error: 'APIキーが設定されていません。右上の設定アイコンからAPIキーを設定してください。最低限Gemini APIキーが必要です。',
      }, { status: 400 });
    }

    const result = await analyzeQuery({ query: message, keys });

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json({
      error: error.message || '分析中にエラーが発生しました。APIキーの設定を確認してください。',
    }, { status: 500 });
  }
}
