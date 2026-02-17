/**
 * 市場分析オーケストレーター（3フェーズアーキテクチャ）
 * Phase 1: Planner - Geminiに調査計画を作らせる
 * Phase 2: Executor - コードがAPIを実行（検証ゲート付き）
 * Phase 3: Reporter - Geminiに結果の解釈だけさせる
 */

import { ApiKeys, AnalysisResult } from '@/types';
import { createResearchPlan } from './planner';
import { executePlan } from './executor';
import { generateReport } from './reporter';

interface AnalyzeParams {
  query: string;
  keys: ApiKeys;
}

/**
 * メイン分析関数（3フェーズ）
 */
export async function analyzeQuery(params: AnalyzeParams): Promise<AnalysisResult> {
  const { query, keys } = params;

  if (!keys.geminiApiKey) {
    throw new Error('Gemini APIキーが設定されていません。設定ページからAPIキーを入力してください。');
  }

  console.log('=== Phase 1: Planning ===');
  console.time('Phase 1');

  // Phase 1: Planner（計画）
  const plan = await createResearchPlan(keys.geminiApiKey, query);
  console.log(`[Planner] Intent: ${plan.intent}, Tasks: ${plan.tasks.length}, Output: ${plan.outputFormat}`);
  console.timeEnd('Phase 1');

  console.log('=== Phase 2: Execution ===');
  console.time('Phase 2');

  // Phase 2: Executor（実行）
  const executorResults = await executePlan(plan, keys);
  const successCount = executorResults.filter(r => r.gate.passed).length;
  console.log(`[Executor] ${successCount}/${executorResults.length} tasks succeeded`);
  console.timeEnd('Phase 2');

  console.log('=== Phase 3: Reporting ===');
  console.time('Phase 3');

  // Phase 3: Reporter（報告）
  const analysisResult = await generateReport(keys.geminiApiKey, plan, executorResults);
  console.log(`[Reporter] Report generated (${analysisResult.locations.length} locations)`);
  console.timeEnd('Phase 3');

  return analysisResult;
}
