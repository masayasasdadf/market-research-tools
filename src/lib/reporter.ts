/**
 * Reporter (報告フェーズ)
 * Executorが取得した生データをGeminiに渡して解釈・提案だけさせる
 * データの根拠を必ず引用させる
 */

import { AnalysisResult, ResearchPlan, ExecutorResult, LocationResult } from '@/types';
import { generateContent, extractJsonFromResponse } from './gemini';

const REPORTER_SYSTEM_INSTRUCTION = `あなたは市場調査の分析レポート作成専門家です。
提供された実データに基づいて、客観的な分析と提案を行います。
必ず具体的な数値やデータを引用して根拠を示してください。
推測や創作は一切せず、提供されたデータのみを使用してください。`;

/**
 * データを要約してプロンプトに含める
 */
function formatDataForReport(results: ExecutorResult[]): string {
  const sections: string[] = [];

  for (const result of results) {
    if (!result.data || !result.gate.passed) {
      sections.push(`### ${result.taskType}\n取得失敗: ${result.gate.message}\n`);
      continue;
    }

    sections.push(`### ${result.taskType} (${result.gate.message})`);

    switch (result.taskType) {
      case 'estat_population':
      case 'estat_business':
        sections.push(formatEstatData(result.data));
        break;

      case 'places_competitors':
      case 'places_nearby':
      case 'places_facilities':
        sections.push(formatPlacesData(result.data, result.gate.resultCount));
        break;

      case 'ads_keywords':
        sections.push(formatAdsData(result.data));
        break;

      default:
        sections.push(JSON.stringify(result.data, null, 2).substring(0, 2000));
    }

    sections.push(''); // 空行
  }

  return sections.join('\n');
}

/**
 * e-Statデータの整形
 */
function formatEstatData(data: any): string {
  if (!data || data.error) return 'データなし';
  return JSON.stringify(data, null, 2).substring(0, 3000);
}

/**
 * Google Placesデータの整形
 */
function formatPlacesData(data: any[], count: number): string {
  if (!Array.isArray(data) || data.length === 0) {
    return `検索結果: 0件`;
  }

  const formatted = data.slice(0, 20).map((place, i) => {
    const parts = [`${i + 1}. ${place.name}`];
    if (place.vicinity) parts.push(`住所: ${place.vicinity}`);
    if (place.rating) parts.push(`評価: ${place.rating}★ (${place.user_ratings_total || 0}件)`);
    if (place.geometry?.location) {
      parts.push(`座標: ${place.geometry.location.lat}, ${place.geometry.location.lng}`);
    }
    return parts.join(' | ');
  });

  return `全${count}件（上位20件表示）:\n${formatted.join('\n')}`;
}

/**
 * Google Adsデータの整形
 */
function formatAdsData(data: any): string {
  if (!data || !data.keywords) return 'データなし';

  const lines = data.keywords.map((kw: any) =>
    `- ${kw.keyword}: ${kw.avgMonthlySearches.toLocaleString()}回/月 (競合: ${kw.competition})`
  );

  return `検索需要データ:\n${lines.join('\n')}\n合計: ${data.totalMonthlySearches.toLocaleString()}回/月`;
}

/**
 * レポート生成（locations形式）
 */
async function generateLocationReport(
  geminiApiKey: string,
  plan: ResearchPlan,
  dataContext: string
): Promise<{ summary: string; locations: LocationResult[] }> {
  const prompt = `以下のデータに基づいて、${plan.area?.prefecture || '対象地域'}における最適な候補地を3〜5箇所提案してください。

## ユーザーの質問
${plan.query}

## 収集データ
${dataContext}

## 出力形式
以下のJSON形式で出力してください。**必ず提供されたデータの数値を引用してください。**

\`\`\`json
{
  "summary": "全体的な分析サマリー（提供データに基づく客観的分析、200文字程度）",
  "locations": [
    {
      "name": "エリア名（例: ○○市△△区）",
      "prefecture": "都道府県名",
      "city": "市区町村名",
      "lat": 緯度（数値、実データから取得）,
      "lng": 経度（数値、実データから取得）,
      "score": 適合スコア（1-100の整数）,
      "reasons": [
        "理由1（必ず具体的な数値を含める。例: 競合店が半径5km内に3件のみで競争が少ない）",
        "理由2（データに基づく根拠を明示）",
        "理由3"
      ],
      "population": 推定人口（データから取得した数値）,
      "competitorCount": 競合店数（実際にカウントした数）,
      "searchDemand": 検索需要（データから取得）,
      "additionalInfo": {
        "主要道路": "データに記載されている道路名",
        "最寄り駅": "データに記載されている駅名",
        "商圏特性": "データから読み取れる特性"
      }
    }
  ]
}
\`\`\`

**重要:**
- 推測や創作は禁止。提供されたデータのみを使用
- 座標は実際のPlacesデータから取得したもののみ使用
- 競合店数は実際にカウントした数値を使用
- 理由には必ず「半径○km内に△件」のような具体的数値を含める`;

  const response = await generateContent(geminiApiKey, prompt, REPORTER_SYSTEM_INSTRUCTION);
  const parsed = extractJsonFromResponse(response);

  if (!parsed || !parsed.locations) {
    return {
      summary: response.substring(0, 500),
      locations: [],
    };
  }

  return parsed;
}

/**
 * レポート生成（data_summary形式 - 汎用調査）
 */
async function generateDataSummaryReport(
  geminiApiKey: string,
  plan: ResearchPlan,
  dataContext: string
): Promise<string> {
  const prompt = `以下のデータに基づいて、ユーザーの質問に答えてください。

## ユーザーの質問
${plan.query}

## 収集データ
${dataContext}

**重要な指示:**
1. 提供されたデータのみを使用し、推測や創作は禁止
2. 必ず具体的な数値を引用してください（例: 「○○市の人口は△△人」「競合店は□件」）
3. データが不足している場合は「データが不足しているため分析できません」と明記
4. マークダウン形式で見やすく整形してください

データに基づく客観的な分析結果を出力してください。`;

  const response = await generateContent(geminiApiKey, prompt, REPORTER_SYSTEM_INSTRUCTION);
  return response;
}

/**
 * メインのレポート生成関数
 */
export async function generateReport(
  geminiApiKey: string,
  plan: ResearchPlan,
  executorResults: ExecutorResult[]
): Promise<AnalysisResult> {
  console.log(`[Reporter] Generating report for ${plan.outputFormat} format...`);

  const dataContext = formatDataForReport(executorResults);

  // データを保存（デバッグ用）
  const rawData: Record<string, any> = {};
  for (const result of executorResults) {
    rawData[result.taskType] = {
      data: result.data,
      gate: result.gate,
      cached: result.cached,
    };
  }

  if (plan.outputFormat === 'locations') {
    const { summary, locations } = await generateLocationReport(
      geminiApiKey,
      plan,
      dataContext
    );

    return {
      query: plan.query,
      type: plan.intent,
      summary,
      locations,
      timestamp: new Date().toISOString(),
      rawData,
    };
  } else {
    // data_summary or mixed
    const summary = await generateDataSummaryReport(geminiApiKey, plan, dataContext);

    return {
      query: plan.query,
      type: plan.intent,
      summary,
      locations: [],
      timestamp: new Date().toISOString(),
      rawData,
    };
  }
}
