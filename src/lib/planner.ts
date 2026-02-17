/**
 * Planner (計画フェーズ)
 * コードで確実に分類・計画を作る。Geminiは呼ばない。
 */

import { ResearchPlan, ResearchTask } from '@/types';
import { PREFECTURE_CODES } from './estat';

/**
 * クエリから都道府県名を抽出
 */
function extractPrefecture(query: string): string | undefined {
  for (const pref of Object.keys(PREFECTURE_CODES)) {
    if (query.includes(pref)) return pref;
  }

  const shortMap: Record<string, string> = {
    '北海': '北海道', '青森': '青森県', '岩手': '岩手県', '宮城': '宮城県',
    '秋田': '秋田県', '山形': '山形県', '福島': '福島県', '茨城': '茨城県',
    '栃木': '栃木県', '群馬': '群馬県', '埼玉': '埼玉県', '千葉': '千葉県',
    '東京': '東京都', '神奈川': '神奈川県', '新潟': '新潟県', '富山': '富山県',
    '石川': '石川県', '福井': '福井県', '山梨': '山梨県', '長野': '長野県',
    '岐阜': '岐阜県', '静岡': '静岡県', '愛知': '愛知県', '三重': '三重県',
    '滋賀': '滋賀県', '京都': '京都府', '大阪': '大阪府', '兵庫': '兵庫県',
    '奈良': '奈良県', '和歌山': '和歌山県', '鳥取': '鳥取県', '島根': '島根県',
    '岡山': '岡山県', '広島': '広島県', '山口': '山口県', '徳島': '徳島県',
    '香川': '香川県', '愛媛': '愛媛県', '高知': '高知県', '福岡': '福岡県',
    '佐賀': '佐賀県', '長崎': '長崎県', '熊本': '熊本県', '大分': '大分県',
    '宮崎': '宮崎県', '鹿児島': '鹿児島県', '沖縄': '沖縄県',
  };

  for (const [short, full] of Object.entries(shortMap)) {
    if (query.includes(short)) return full;
  }

  return undefined;
}

/**
 * 市区町村名を抽出
 */
function extractCity(query: string): string | undefined {
  // 具体的な区名を先にチェック
  const specificAreas = [
    '早良区', '博多区', '中央区', '東区', '西区', '南区', '城南区',
    '北区', '港区', '渋谷区', '新宿区', '千代田区', '品川区', '大田区',
    '世田谷区', '目黒区', '杉並区', '練馬区', '板橋区', '豊島区',
    '中野区', '荒川区', '台東区', '墨田区', '江東区', '足立区', '葛飾区', '江戸川区',
  ];
  for (const area of specificAreas) {
    if (query.includes(area)) return area;
  }

  // 一般的な市区町村パターン
  const match = query.match(/([^\s、。で]+?[市町村])/);
  if (match) return match[0];

  return undefined;
}

/**
 * クエリの種別を判定（コードで確実に分類）
 */
function classifyIntent(query: string): 'store_location' | 'signage_location' | 'general_research' {
  const signageKeywords = ['看板', 'サイン', '広告', '掲示', 'サイネージ', '屋外広告', 'ビルボード'];
  const storeKeywords = ['出店', '店舗', '開業', '開店', '候補地', '適した場所', '最適なエリア', '立地'];

  // 汎用調査キーワード（出店・看板ではない質問）
  const generalKeywords = [
    '人口', '増減', 'トレンド', '推移', '交通量', '道路', '通行量',
    '世帯', '年齢', '高齢化', '若者', '住民', '統計', 'データ',
    '比較', '違い', '特徴', '教えて', '調べて',
  ];

  if (signageKeywords.some(k => query.includes(k))) return 'signage_location';
  if (storeKeywords.some(k => query.includes(k))) return 'store_location';

  // 出店キーワードがなくて汎用キーワードがあれば general
  if (generalKeywords.some(k => query.includes(k))) return 'general_research';

  // どれにも該当しない場合、ビジネス系っぽければ store、それ以外は general
  const businessHints = ['需要', '競合', 'エリア'];
  if (businessHints.some(k => query.includes(k))) return 'store_location';

  return 'general_research';
}

/**
 * クエリからビジネスキーワードを抽出
 */
function extractBusinessKeywords(query: string): string[] {
  // 日本語の助詞・接続詞・句読点で分割
  const words = query
    .split(/[\s、。・「」（）\n]+/)
    .flatMap(chunk =>
      // 助詞で更に分割: 「福岡県で廃車買取の需要が高く」→ [福岡県, 廃車買取, 需要, 高く]
      chunk.split(/(?:で|の|に|を|が|は|と|も|から|まで|より|へ|って|した|する|して|という|ような|ている|ている|けど|だけ|ばかり|ほど|など|とか|やら|なら|ので|のに|ても|ては|では|には|とは|への|からの|までの|よりも)/)
    )
    .map(w => w.trim())
    .filter(w => w.length >= 2);

  // 除外するワード（一般語・指示語）
  const stopWords = new Set([
    '出店', '適した', 'エリア', '場所', 'いくつか', '出して', 'ください',
    '需要', '高く', '競合', '少ない', '設置', '看板', 'ピックアップ', '複数',
    '教えて', '調べて', '知りたい', '分析', '最適', '人口', '増減', '地域別',
    '交通量', '多い', '道路', '候補地', '適した場所', '最適な', 'お願い',
    'ある', 'いる', 'ない', 'どう', 'この', 'その', 'どの',
  ]);

  const prefNames = new Set(Object.keys(PREFECTURE_CODES));

  const filtered = words.filter(w =>
    !stopWords.has(w) &&
    !prefNames.has(w) &&
    !w.match(/^[ぁ-ん]{1,3}$/) // 短いひらがなを除外
  );

  return filtered.length > 0 ? filtered : [];
}

/**
 * intentとクエリ内容からタスクリストを生成（コード決定）
 */
function buildTasks(
  intent: 'store_location' | 'signage_location' | 'general_research',
  query: string,
  businessKeywords: string[],
  prefecture?: string,
): ResearchTask[] {
  const tasks: ResearchTask[] = [];

  switch (intent) {
    case 'store_location':
      // 出店分析: 人口 + 競合 + 検索需要
      if (prefecture) {
        tasks.push({ type: 'estat_population', params: {}, required: true });
        tasks.push({ type: 'estat_business', params: {}, required: false });
      }
      if (businessKeywords.length > 0 && prefecture) {
        tasks.push({
          type: 'places_competitors',
          params: { keyword: businessKeywords.join(' '), radius: 5000 },
          required: true,
        });
      }
      tasks.push({
        type: 'ads_keywords',
        params: { keywords: businessKeywords.map(k => prefecture ? `${k} ${prefecture}` : k) },
        required: false,
      });
      break;

    case 'signage_location':
      // 看板分析: 人口 + 交通・施設情報
      if (prefecture) {
        tasks.push({ type: 'estat_population', params: {}, required: true });
      }
      if (businessKeywords.length > 0 && prefecture) {
        tasks.push({
          type: 'places_competitors',
          params: { keyword: `${businessKeywords.join(' ')} ${prefecture}`, radius: 5000 },
          required: false,
        });
      }
      break;

    case 'general_research':
      // 汎用調査: 質問内容から必要なデータを判断
      if (prefecture) {
        tasks.push({ type: 'estat_population', params: {}, required: true });
      }

      // 交通量・道路に関する質問
      if (query.match(/交通量|道路|通行|車|幹線/)) {
        if (businessKeywords.length > 0 || prefecture) {
          tasks.push({
            type: 'places_competitors',
            params: {
              keyword: `主要道路 交差点 ${prefecture || ''}`.trim(),
              radius: 5000,
            },
            required: false,
          });
        }
      }

      // 事業所・産業に関する質問
      if (query.match(/事業所|産業|企業|会社|商業/)) {
        if (prefecture) {
          tasks.push({ type: 'estat_business', params: {}, required: false });
        }
      }
      break;
  }

  return tasks;
}

/**
 * 調査計画を生成（コードのみ、Geminiは使わない）
 */
export function createResearchPlan(query: string): ResearchPlan {
  const prefecture = extractPrefecture(query);
  const city = extractCity(query);
  const intent = classifyIntent(query);
  const businessKeywords = extractBusinessKeywords(query);
  const tasks = buildTasks(intent, query, businessKeywords, prefecture);

  let outputFormat: 'locations' | 'data_summary' | 'mixed';
  if (intent === 'general_research') {
    outputFormat = 'data_summary';
  } else {
    outputFormat = 'locations';
  }

  return {
    query,
    intent,
    area: {
      prefecture,
      city,
      radius: 5000,
    },
    tasks,
    outputFormat,
  };
}
