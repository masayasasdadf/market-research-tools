/**
 * 市場分析オーケストレーター（3フェーズアーキテクチャ）
 *
 * Phase 1: Planner  - コードで確実に分類・計画（Gemini使わない）
 * Phase 2: Executor - コードがAPIを実行（検証ゲート付き）
 * Phase 3: Reporter - Geminiに結果の解釈だけさせる（1回のみ）
 *         + enrich  - 出店/看板の場合、候補地ごとにPlaces補強
 */

import { ApiKeys, AnalysisResult } from '@/types';
import { createResearchPlan } from './planner';
import { executePlan, enrichLocations } from './executor';
import { generateReport } from './reporter';

interface AnalyzeParams {
  query: string;
  keys: ApiKeys;
}

/**
 * クエリからビジネスキーワードを抽出（enrich用）
 */
function extractBusinessKeywords(query: string): string[] {
  const words = query
    .split(/[\s、。・「」（）\n]+/)
    .flatMap(chunk =>
      chunk.split(/(?:で|の|に|を|が|は|と|も|から|まで|より|へ|って|した|する|して|という|ような|ている|けど|だけ|ほど|など|とか|なら|ので|のに|ても|では|には|とは)/)
    )
    .map(w => w.trim())
    .filter(w => w.length >= 2);

  const stopWords = new Set([
    '出店', '適した', 'エリア', '場所', 'いくつか', '出して', 'ください',
    '需要', '高く', '競合', '少ない', '設置', '看板', 'ピックアップ', '複数',
    '教えて', '調べて', '知りたい', '分析', '最適', 'お願い',
  ]);

  const filtered = words.filter(w =>
    !stopWords.has(w) && !w.match(/^[ぁ-ん]{1,3}$/)
  );
  return filtered.length > 0 ? filtered : [];
}

/**
 * メイン分析関数
 */
export async function analyzeQuery(params: AnalyzeParams): Promise<AnalysisResult> {
  const { query, keys } = params;

  if (!keys.geminiApiKey) {
    throw new Error('Gemini APIキーが設定されていません。設定ページからAPIキーを入力してください。');
  }

  // Phase 1: Planner（コードで即座に計画、Geminiは呼ばない）
  const plan = createResearchPlan(query);
  console.log(`[Planner] intent=${plan.intent}, tasks=${plan.tasks.length}, output=${plan.outputFormat}`);

  // Phase 2: Executor（APIを実行、検証ゲート付き）
  const executorResults = await executePlan(plan, keys);
  const ok = executorResults.filter(r => r.gate.passed).length;
  console.log(`[Executor] ${ok}/${executorResults.length} tasks OK`);

  // Phase 3: Reporter（Geminiに解釈させる、1回のみ）
  const result = await generateReport(keys.geminiApiKey, plan, executorResults);
  console.log(`[Reporter] ${result.locations.length} locations, type=${result.type}`);

  // 出店/看板の場合: 候補地ごとの競合数・周辺情報を実データで補強
  if (result.locations.length > 0) {
    const businessKeywords = extractBusinessKeywords(query);
    result.locations = await enrichLocations(result.locations, keys, businessKeywords);
    console.log(`[Enrich] ${result.locations.length} locations enriched`);
  }

  return result;
}
