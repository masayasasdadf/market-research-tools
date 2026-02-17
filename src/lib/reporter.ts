/**
 * Reporter (報告フェーズ)
 * Executorが取得した生データをGeminiに渡して解釈・提案だけさせる
 * Geminiを呼ぶのはここだけ（1回のみ）
 */

import { AnalysisResult, ResearchPlan, ExecutorResult } from '@/types';
import { generateContent, extractJsonFromResponse } from './gemini';

const REPORTER_SYSTEM = `あなたは日本の市場調査・ビジネス立地分析の専門AIアシスタントです。
提供されたデータがあれば優先的に活用し、具体的な数値を引用してください。
データが不足している場合でも、あなたの知識を活用して必ず有用な提案を行ってください。
回答は必ず日本語で行ってください。`;

/**
 * Executor結果をテキスト化
 */
function formatExecutorData(results: ExecutorResult[]): string {
  const sections: string[] = [];

  for (const result of results) {
    if (!result.data) {
      sections.push(`### ${result.taskType}: 取得失敗 (${result.gate.message})`);
      continue;
    }

    sections.push(`### ${result.taskType} (${result.gate.message})`);

    switch (result.taskType) {
      case 'places_competitors':
      case 'places_nearby':
      case 'places_facilities':
        if (Array.isArray(result.data)) {
          const items = result.data.slice(0, 30).map((p: any, i: number) => {
            const parts = [`${i + 1}. ${p.name}`];
            if (p.vicinity) parts.push(`住所:${p.vicinity}`);
            if (p.rating) parts.push(`評価:${p.rating}★(${p.user_ratings_total || 0}件)`);
            if (p.geometry?.location) {
              parts.push(`座標:${p.geometry.location.lat},${p.geometry.location.lng}`);
            }
            return parts.join(' / ');
          });
          sections.push(`全${result.data.length}件:\n${items.join('\n')}`);
        }
        break;

      case 'estat_population':
      case 'estat_business':
        sections.push(JSON.stringify(result.data, null, 2).substring(0, 4000));
        break;

      case 'ads_keywords':
        if (result.data?.keywords) {
          const lines = result.data.keywords.map((kw: any) =>
            `- ${kw.keyword}: ${kw.avgMonthlySearches}回/月 (競合:${kw.competition})`
          );
          sections.push(lines.join('\n'));
        }
        break;

      default:
        sections.push(JSON.stringify(result.data, null, 2).substring(0, 2000));
    }

    sections.push('');
  }

  return sections.join('\n');
}

/**
 * 出店候補地の提案（JSON出力）
 */
function buildStorePrompt(plan: ResearchPlan, dataText: string): string {
  return `${plan.area?.prefecture || '対象地域'}で最適な出店候補地を3〜5箇所提案してください。

## ユーザーの質問
${plan.query}

## 収集データ
${dataText}

## 重要な指示
- **必ず3〜5箇所の候補地を提案してください。**データが不足していても、あなたの知識を活用して提案してください。
- 収集データがある場合は、その数値を根拠として引用してください。
- 座標(lat/lng)は実在する場所の正確な値を使用してください。
- 各候補地には具体的な推薦理由を3つ以上記載してください。

## 出力形式（必ずこのJSON形式で出力）
\`\`\`json
{
  "summary": "分析サマリー（200文字程度）",
  "locations": [
    {
      "name": "エリア名（例: ○○市△△区）",
      "prefecture": "都道府県名",
      "city": "市区町村名",
      "lat": 緯度（数値）,
      "lng": 経度（数値）,
      "score": 適合スコア（1-100）,
      "reasons": ["推薦理由1", "推薦理由2", "推薦理由3"],
      "population": 推定人口（数値）,
      "competitorCount": 周辺の競合店数（数値）,
      "searchDemand": 検索需要（数値、あれば）,
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
 * 看板設置候補地の提案（JSON出力）
 */
function buildSignagePrompt(plan: ResearchPlan, dataText: string): string {
  return `${plan.area?.prefecture || '対象地域'}で看板設置に最適な場所を3〜5箇所提案してください。

## ユーザーの質問
${plan.query}

## 収集データ
${dataText}

## 重要な指示
- **必ず3〜5箇所の候補地を提案してください。**データが不足していても、あなたの知識を活用して提案してください。
- 看板設置に重要な要素: 交通量、視認性、ターゲット層、コスト効率、規制
- 座標(lat/lng)は実在する場所の正確な値を使用してください。

## 出力形式（必ずこのJSON形式で出力）
\`\`\`json
{
  "summary": "分析サマリー（200文字程度）",
  "locations": [
    {
      "name": "設置場所名（例: 国道○号線 △△交差点付近）",
      "prefecture": "都道府県名",
      "city": "市区町村名",
      "lat": 緯度（数値）,
      "lng": 経度（数値）,
      "score": 適合スコア（1-100）,
      "reasons": ["推薦理由1", "推薦理由2", "推薦理由3"],
      "trafficVolume": "推定交通量（例: 日量約2万台）",
      "additionalInfo": {
        "道路種別": "国道/県道/市道",
        "周辺施設": "大型商業施設、住宅地",
        "視認性": "良好（直線道路、速度低下地点）",
        "規制情報": "規制区域の有無"
      }
    }
  ]
}
\`\`\``;
}

/**
 * 汎用調査レポート（マークダウン出力）
 */
function buildGeneralPrompt(plan: ResearchPlan, dataText: string): string {
  return `以下のデータに基づいて、ユーザーの質問に直接答えてください。

## ユーザーの質問
${plan.query}

## 収集データ
${dataText}

## 重要な指示
1. ユーザーの質問に直接答えること（出店提案ではない）
2. 必ず具体的な数値を引用すること
3. データが不足している場合は「データ不足のため正確な回答ができません」と明記
4. マークダウン形式で見やすく整形してください
5. 表やリストを活用して分かりやすくまとめてください`;
}

/**
 * レポートを生成（Gemini呼び出し1回のみ）
 */
export async function generateReport(
  geminiApiKey: string,
  plan: ResearchPlan,
  executorResults: ExecutorResult[],
): Promise<AnalysisResult> {
  const dataText = formatExecutorData(executorResults);

  // intent別にプロンプトを切り替え
  let prompt: string;
  switch (plan.intent) {
    case 'store_location':
      prompt = buildStorePrompt(plan, dataText);
      break;
    case 'signage_location':
      prompt = buildSignagePrompt(plan, dataText);
      break;
    case 'general_research':
    default:
      prompt = buildGeneralPrompt(plan, dataText);
      break;
  }

  const response = await generateContent(geminiApiKey, prompt, REPORTER_SYSTEM);

  // 汎用調査はマークダウンテキストをそのまま返す
  if (plan.intent === 'general_research') {
    return {
      query: plan.query,
      type: 'general_research',
      summary: response,
      locations: [],
      timestamp: new Date().toISOString(),
    };
  }

  // 出店/看板はJSONパース
  const parsed = extractJsonFromResponse(response);

  if (!parsed || !parsed.locations) {
    return {
      query: plan.query,
      type: plan.intent,
      summary: response.substring(0, 500),
      locations: [],
      timestamp: new Date().toISOString(),
    };
  }

  // locationsの型を整える
  const locations = (parsed.locations || []).map((loc: any) => ({
    name: loc.name || '',
    prefecture: loc.prefecture || plan.area?.prefecture || '',
    city: loc.city || '',
    lat: loc.lat || 0,
    lng: loc.lng || 0,
    score: loc.score || 0,
    reasons: loc.reasons || [],
    population: loc.population,
    competitorCount: loc.competitorCount,
    searchDemand: loc.searchDemand,
    trafficVolume: loc.trafficVolume,
    additionalInfo: loc.additionalInfo || {},
  }));

  return {
    query: plan.query,
    type: plan.intent,
    summary: parsed.summary || '',
    locations,
    timestamp: new Date().toISOString(),
  };
}
