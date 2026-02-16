/**
 * Gemini API integration
 * AIによる市場分析、エリア推薦、解説生成
 */

interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface AnalysisContext {
  query: string;
  prefecture?: string;
  businessType?: string;
  populationData?: any;
  competitorData?: any;
  searchDemandData?: any;
  facilityData?: any;
}

/**
 * Gemini APIでテキスト生成
 */
export async function generateContent(
  apiKey: string,
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Gemini API error: ${res.status} - ${error}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * 出店候補地分析プロンプト生成
 */
export function buildStoreLocationPrompt(context: AnalysisContext): string {
  return `あなたは日本の市場調査の専門家です。以下のデータと条件に基づいて、最適な出店候補地を分析してください。

## ユーザーの質問
${context.query}

## 対象地域
${context.prefecture || '指定なし'}

## 業種
${context.businessType || '不明'}

## 利用可能なデータ
${context.populationData ? `### 人口統計データ\n${JSON.stringify(context.populationData, null, 2).substring(0, 3000)}` : '人口統計: データなし'}

${context.competitorData ? `### 競合データ\n${JSON.stringify(context.competitorData, null, 2).substring(0, 3000)}` : '競合データ: なし'}

${context.searchDemandData ? `### 検索需要データ\n${JSON.stringify(context.searchDemandData, null, 2).substring(0, 2000)}` : '検索需要: データなし'}

${context.facilityData ? `### 周辺施設データ\n${JSON.stringify(context.facilityData, null, 2).substring(0, 2000)}` : '周辺施設: データなし'}

## 出力形式
以下のJSON形式で出店候補地を3〜5箇所提案してください。必ず有効なJSONのみを出力してください。

\`\`\`json
{
  "summary": "全体的な分析サマリー（200文字程度）",
  "locations": [
    {
      "name": "エリア名（例: ○○市△△区）",
      "prefecture": "都道府県名",
      "city": "市区町村名",
      "lat": 緯度（数値）,
      "lng": 経度（数値）,
      "score": 適合スコア（1-100の整数）,
      "reasons": ["推薦理由1", "推薦理由2", "推薦理由3"],
      "population": 推定人口（数値）,
      "competitorCount": 競合店数（数値）,
      "searchDemand": 検索需要（数値）,
      "additionalInfo": {
        "主要道路": "国道○号線沿い",
        "最寄り駅": "○○駅（徒歩△分）",
        "商圏特性": "住宅密集地・車保有率高"
      }
    }
  ]
}
\`\`\``;
}

/**
 * 看板設置候補地分析プロンプト生成
 */
export function buildSignageLocationPrompt(context: AnalysisContext): string {
  return `あなたは日本の屋外広告・看板設置の専門家です。以下のデータと条件に基づいて、看板設置に最適な場所を分析してください。

## ユーザーの質問
${context.query}

## 対象地域
${context.prefecture || '指定なし'}

## 利用可能なデータ
${context.competitorData ? `### 周辺施設・交通データ\n${JSON.stringify(context.competitorData, null, 2).substring(0, 3000)}` : 'データなし'}

${context.facilityData ? `### 周辺施設データ\n${JSON.stringify(context.facilityData, null, 2).substring(0, 2000)}` : '周辺施設: データなし'}

${context.populationData ? `### 人口統計データ\n${JSON.stringify(context.populationData, null, 2).substring(0, 2000)}` : '人口統計: なし'}

## 看板設置の評価基準
1. **交通量**: 幹線道路沿い、主要交差点近くの通行量
2. **視認性**: 見通し、看板が見やすい立地
3. **ターゲット層**: 周辺の住民層・通勤者層との合致
4. **コスト効率**: 設置費用に対する露出効果
5. **規制**: 屋外広告物条例への適合性

## 出力形式
以下のJSON形式で看板設置候補地を3〜5箇所提案してください。必ず有効なJSONのみを出力してください。

\`\`\`json
{
  "summary": "全体的な分析サマリー（200文字程度）",
  "locations": [
    {
      "name": "設置場所名（例: 国道○号線 △△交差点付近）",
      "prefecture": "都道府県名",
      "city": "市区町村名",
      "lat": 緯度（数値）,
      "lng": 経度（数値）,
      "score": 適合スコア（1-100の整数）,
      "reasons": ["推薦理由1", "推薦理由2", "推薦理由3"],
      "trafficVolume": "推定交通量（例: 日量約2万台）",
      "additionalInfo": {
        "道路種別": "国道/県道/市道",
        "周辺施設": "大型商業施設、住宅地",
        "視認性": "良好（直線道路、速度低下地点）",
        "推定日間露出": "約○万人",
        "規制情報": "○○市屋外広告物条例の規制区域外"
      }
    }
  ]
}
\`\`\``;
}


/**
 * 一般的な市場調査・統計質問向けプロンプト
 */
export function buildGeneralResearchPrompt(context: AnalysisContext): string {
  return `あなたは日本の市場調査・統計分析の専門家です。以下の質問に対して、必ず質問意図に沿って回答してください。

## ユーザーの質問
${context.query}

## 対象地域
${context.prefecture || '指定なし'}

## 利用可能なデータ
${context.populationData ? `### 人口統計データ
${JSON.stringify(context.populationData, null, 2).substring(0, 3500)}` : '人口統計: データなし'}

${context.searchDemandData ? `### 検索需要データ
${JSON.stringify(context.searchDemandData, null, 2).substring(0, 2200)}` : '検索需要: データなし'}

${context.facilityData ? `### 産業・施設データ
${JSON.stringify(context.facilityData, null, 2).substring(0, 2200)}` : '産業・施設データ: データなし'}

${context.competitorData ? `### 地点・道路・施設データ
${JSON.stringify(context.competitorData, null, 2).substring(0, 2200)}` : '地点・道路・施設データ: データなし'}

## 重要ルール
- 「人口増減」を聞かれたら、出店候補地ではなく人口の増減と傾向を答える。
- 「交通量の多い道路」を聞かれたら、道路名・根拠・推定重要度を答える。
- 不足データがある場合は、その不足を明記しつつ可能な範囲で回答する。
- 必ず有効なJSONのみを返す。

## 出力形式
\`\`\`json
{
  "summary": "質問への直接回答（200〜400文字）",
  "insights": [
    "重要ポイント1",
    "重要ポイント2",
    "重要ポイント3"
  ],
  "locations": []
}
\`\`\`
`;
}

/**
 * GeminiレスポンスからJSON部分を抽出
 */
export function extractJsonFromResponse(text: string): any {
  // コードブロック内のJSONを探す
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch { /* fall through */ }
  }

  // 直接JSONとして解析を試みる
  try {
    return JSON.parse(text.trim());
  } catch { /* fall through */ }

  // {...} パターンを探す
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch { /* fall through */ }
  }

  return null;
}

const SYSTEM_INSTRUCTION = `あなたは日本の市場調査・ビジネス立地分析の専門AIアシスタントです。
ユーザーの質問に対して、データに基づいた的確な分析と提案を行います。
意図と異なる回答（例: 人口質問に出店候補を返す）は禁止です。
回答は必ず日本語で行ってください。`;

export { SYSTEM_INSTRUCTION };
