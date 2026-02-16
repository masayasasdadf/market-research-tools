'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ApiKeyField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  required: boolean;
}

const API_KEY_FIELDS: ApiKeyField[] = [
  {
    key: 'geminiApiKey',
    label: 'Gemini API Key',
    description: 'Google AI StudioからGemini APIキーを取得してください。AI分析機能に必須です。',
    placeholder: 'AIza...',
    required: true,
  },
  {
    key: 'estatAppId',
    label: 'e-Stat アプリケーションID',
    description: 'e-Stat APIの利用登録で取得できるアプリケーションIDです。人口統計・事業所データの取得に使用します。',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx',
    required: false,
  },
  {
    key: 'googlePlacesApiKey',
    label: 'Google Places API Key',
    description: 'Google Cloud Consoleから取得できるAPIキーです。競合店・周辺施設の検索に使用します。',
    placeholder: 'AIza...',
    required: false,
  },
  {
    key: 'googleAdsApiKey',
    label: 'Google Ads API Key (OAuth Token)',
    description: 'Google Ads APIのOAuthアクセストークンです。検索ボリュームデータの取得に使用します。',
    placeholder: 'ya29...',
    required: false,
  },
  {
    key: 'googleAdsDeveloperToken',
    label: 'Google Ads Developer Token',
    description: 'Google Ads APIの開発者トークンです。',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx',
    required: false,
  },
  {
    key: 'googleAdsCustomerId',
    label: 'Google Ads Customer ID',
    description: 'Google Ads のお客様ID（ハイフンなし10桁）です。',
    placeholder: '1234567890',
    required: false,
  },
];

export default function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        const initialKeys: Record<string, string> = {};
        API_KEY_FIELDS.forEach(field => {
          initialKeys[field.key] = data.keys?.[field.key] || '';
        });
        setKeys(initialKeys);
      })
      .catch(() => setMessage({ type: 'error', text: '設定の読み込みに失敗しました' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'APIキーを保存しました' });
        // Reload masked keys
        const data = await fetch('/api/settings').then(r => r.json());
        const updatedKeys: Record<string, string> = {};
        API_KEY_FIELDS.forEach(field => {
          updatedKeys[field.key] = data.keys?.[field.key] || '';
        });
        setKeys(updatedKeys);
      } else {
        setMessage({ type: 'error', text: '保存に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '通信エラーが発生しました' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-bold text-gray-900">API設定</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h2 className="font-semibold text-blue-800 mb-1">APIキーの設定</h2>
              <p className="text-sm text-blue-700">
                各種APIキーを入力してください。最低限 <strong>Gemini API Key</strong> が必要です。
                その他のAPIキーを追加すると、より精度の高い分析が可能になります。
              </p>
            </div>

            {message && (
              <div
                className={`mb-6 p-3 rounded-lg text-sm ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="space-y-6">
              {API_KEY_FIELDS.map(field => (
                <div key={field.key} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="font-semibold text-gray-800 text-sm">
                      {field.label}
                    </label>
                    {field.required && (
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">必須</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{field.description}</p>
                  <input
                    type="password"
                    value={keys[field.key] || ''}
                    onChange={e => setKeys(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg px-8 py-3 font-medium transition-colors"
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>

            <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700 mb-2 text-sm">APIキーの取得方法</h3>
              <ul className="text-xs text-gray-600 space-y-2">
                <li>
                  <strong>Gemini API:</strong>{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Google AI Studio
                  </a>
                  からAPIキーを作成
                </li>
                <li>
                  <strong>e-Stat API:</strong>{' '}
                  <a href="https://www.e-stat.go.jp/api/api-info/api-guide" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    e-Stat API利用ガイド
                  </a>
                  から利用登録
                </li>
                <li>
                  <strong>Google Places API:</strong>{' '}
                  <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Google Cloud Console
                  </a>
                  でPlaces APIを有効化しAPIキーを作成
                </li>
                <li>
                  <strong>Google Ads API:</strong>{' '}
                  <a href="https://developers.google.com/google-ads/api/docs/get-started/introduction" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Google Ads API 公式ドキュメント
                  </a>
                  を参照
                </li>
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
