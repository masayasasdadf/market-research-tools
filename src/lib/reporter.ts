/**
 * Reporter (報告フェーズ)
 * Executorが取得した生データをGeminiに渡して解釈・提案だけさせる
 * Geminiを呼ぶのはここだけ（1回のみ）
 */

import { AnalysisResult, ResearchPlan, ExecutorResult } from '@/types';
import { generateContent, extractJsonFromResponse } from './gemini';

const REPORTER_SYSTEM = `あなたは日本の市場調査・ビジネス立地分析の専門AIアシスタントです。
提供されたデータに基づいて客観的に分析します。回答は必ず日本語で行ってください。
根拠となる数値は必ず引用してください。データにないことは書かないでください。`;

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
  return `以下のデータに基づいて、${plan.area?.prefecture || '対象地域'}で最適な出店候補地を3〜5箇所提案してください。

## ユーザーの質問
${plan.query}

## 収集データ
${dataText}

## 出力形式（必ずこのJSON形式で出力）
\`\`\`json
{
  "summary": "分析サマリー（データに基づく客観的分析、200文字程度）",
  "locations": [
    {
      "name": "エリア名",
      "prefecture": "都道府県名",
      "city": "市区町村名",
      "lat": 緯度（数値）,
      "lng": 経度（数値）,
      "score": 適合スコア（1-100）,
      "reasons": ["根拠1（数値引用必須）", "根拠2", "根拠3"],
      "population": 推定人口（数値）,
      "competitorCount": 競合店数（数値）,
      "searchDemand": 検索需要（数値、あれば）,
      "additionalInfo": {
        "主要道路": "道路名",
        "最寄り駅": "駅名",
        "商圏特性": "特性"
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
  return `以下のデータに基づいて、${plan.area?.prefecture || '対象地域'}で看板設置に最適な場所を3〜5箇所提案してください。

## ユーザーの質問
${plan.query}

## 収集データ
${dataText}

## 看板設置の評価基準
1. 交通量: 幹線道路沿い、主要交差点近くの通行量
2. 視認性: 見通し、看板が見やすい立地
3. ターゲット層: 周辺の住民層・通勤者層との合致
4. コスト効率: 設置費用に対する露出効果
5. 規制: 屋外広告物条例への適合性

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
      "reasons": ["根拠1（数値引用必須）", "根拠2", "根拠3"],
      "trafficVolume": "推定交通量（例: 日量約2万台）",
      "additionalInfo": {
        "道路種別": "国道/県道/市道",
        "周辺施設": "施設名",
        "視認性": "評価",
        "規制情報": "規制の有無"
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
