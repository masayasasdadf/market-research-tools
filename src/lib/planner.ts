/**
 * Planner (計画フェーズ)
 * Geminiに「どう調べるか」の計画だけを作らせる
 * 実際のAPI実行は一切しない
 */

import { ResearchPlan } from '@/types';
import { generateContent, extractJsonFromResponse } from './gemini';
import { PREFECTURE_CODES } from './estat';

const PLANNER_SYSTEM_INSTRUCTION = `あなたは市場調査の計画立案専門家です。
ユーザーの質問を分析し、どのデータソースを使ってどのように調べるべきかを計画するだけです。
実際のデータ取得や分析は行いません。計画のみをJSON形式で出力してください。`;

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
  const cityPatterns = [
    /([^\s]+?[市区町村])/g,
    /早良区/,
    /博多区/,
    /中央区/,
    /東区/,
    /西区/,
    /南区/,
    /城南区/,
  ];

  for (const pattern of cityPatterns) {
    const match = query.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

/**
 * Geminiで調査計画を生成
 */
export async function createResearchPlan(
  geminiApiKey: string,
  query: string
): Promise<ResearchPlan> {
  const prefecture = extractPrefecture(query);
  const city = extractCity(query);

  const prompt = `ユーザーの質問を分析し、市場調査の計画を立ててください。

## ユーザーの質問
${query}

## 利用可能なデータソース
1. **estat_population**: e-Stat人口統計（市区町村別人口、世帯数、昼夜人口、年齢構成など）
2. **estat_business**: e-Stat事業所統計（業種別事業所数、従業員数など）
3. **places_competitors**: Google Places競合検索（特定業種の店舗検索）
4. **places_facilities**: Google Places施設検索（駅、道路、公共施設など）
5. **places_nearby**: Google Places周辺検索（特定地点の周辺情報）
6. **ads_keywords**: Google Ads検索需要（キーワード検索ボリューム）
7. **traffic_analysis**: 交通量分析（POI密度などから推定）
8. **demographic_trends**: 人口動態分析（増減トレンドなど）

## 出力形式
以下のJSON形式で調査計画を出力してください。実際のデータ取得は行わず、計画のみを作成してください。

\`\`\`json
{
  "query": "元の質問",
  "intent": "store_location | signage_location | general_research",
  "area": {
    "prefecture": "都道府県名（あれば）",
    "city": "市区町村名（あれば）",
    "radius": 調査半径（メートル、推奨値）
  },
  "tasks": [
    {
      "type": "estat_population",
      "params": {
        "metrics": ["night_pop", "day_pop", "households"]
      },
      "required": true
    },
    {
      "type": "places_competitors",
      "params": {
        "keyword": "業種キーワード",
        "radius": 5000
      },
      "required": false
    }
  ],
  "outputFormat": "locations | data_summary | mixed"
}
\`\`\`

**重要な判断基準:**
- 「出店」「店舗」「開業」→ intent: "store_location"
- 「看板」「広告」→ intent: "signage_location"
- 「人口」「増減」「トレンド」「交通量」など → intent: "general_research"
- 「競合0」を避けるため、places_competitorsは広めのradius（5000m以上）を設定
- 地域が明示されている場合は必ずarea.prefecture/cityを設定
- outputFormat: 出店候補地→"locations", データ分析→"data_summary", 両方→"mixed"`;

  const response = await generateContent(geminiApiKey, prompt, PLANNER_SYSTEM_INSTRUCTION);
  const parsed = extractJsonFromResponse(response);

  if (!parsed || !parsed.tasks) {
    // パース失敗時は最小限のフォールバック計画を作成
    return {
      query,
      intent: 'general_research',
      area: prefecture ? { prefecture, radius: 5000 } : undefined,
      tasks: [
        {
          type: 'estat_population',
          params: { metrics: ['total'] },
          required: false,
        },
      ],
      outputFormat: 'data_summary',
    };
  }

  // area情報の補強
  if (!parsed.area && (prefecture || city)) {
    parsed.area = {
      prefecture,
      city,
      radius: 5000,
    };
  }

  return parsed as ResearchPlan;
}
