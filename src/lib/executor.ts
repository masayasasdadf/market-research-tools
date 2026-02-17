/**
 * Executor (実行フェーズ)
 * 計画に基づいてAPIを実行し、検証ゲートで品質チェック
 * Geminiは一切使わず、コードが確実に実行
 */

import { ApiKeys, ResearchTask, ExecutorResult, ValidationGate, TaskType, ResearchPlan } from '@/types';
import { PREFECTURE_CODES, getPopulationByArea, getBusinessStats } from './estat';
import { textSearch, nearbySearch, getAreaFacilities } from './google-places';
import { getKeywordMetrics } from './google-ads';

// 結果キャッシュ（同一セッション内での重複API呼び出しを防止）
const resultCache = new Map<string, any>();

/**
 * キャッシュキーを生成
 */
function getCacheKey(taskType: TaskType, params: Record<string, any>): string {
  return `${taskType}:${JSON.stringify(params)}`;
}

/**
 * 検証ゲート: 結果が妥当かチェック
 */
function validateResult(
  taskType: TaskType,
  data: any,
  retryAttempt: number
): ValidationGate {
  let passed = true;
  let message = 'OK';
  let resultCount = 0;

  switch (taskType) {
    case 'places_competitors':
    case 'places_facilities':
    case 'places_nearby':
      resultCount = Array.isArray(data) ? data.length : 0;
      if (resultCount === 0) {
        passed = false;
        message = '検索結果0件。radiusを拡大して再試行が必要です。';
      } else {
        message = `${resultCount}件取得成功`;
      }
      break;

    case 'estat_population':
    case 'estat_business':
      if (!data || data.error) {
        passed = false;
        message = 'e-Stat API取得失敗';
      } else {
        passed = true;
        message = 'e-Statデータ取得成功';
      }
      break;

    case 'ads_keywords':
      if (data && data.keywords) {
        resultCount = data.keywords.length;
        message = `キーワード${resultCount}件取得`;
      } else {
        message = '検索需要データ取得（推定値）';
      }
      break;

    default:
      message = 'データ取得完了';
  }

  return {
    passed,
    taskType,
    resultCount,
    retryAttempt,
    message,
  };
}

/**
 * タスク実行（リトライ・検証ゲート付き）
 */
async function executeTask(
  task: ResearchTask,
  keys: ApiKeys,
  plan: ResearchPlan
): Promise<ExecutorResult> {
  const maxRetries = 3;
  let retryAttempt = 0;
  let currentParams = { ...task.params };

  while (retryAttempt <= maxRetries) {
    const cacheKey = getCacheKey(task.type, currentParams);

    // キャッシュチェック
    if (resultCache.has(cacheKey)) {
      const cachedData = resultCache.get(cacheKey);
      const gate = validateResult(task.type, cachedData, retryAttempt);
      return {
        taskType: task.type,
        data: cachedData,
        gate,
        cached: true,
      };
    }

    // タスク実行
    let data: any = null;
    try {
      data = await executeTaskOnce(task.type, currentParams, keys, plan);
    } catch (error) {
      console.error(`Executor error (${task.type}):`, error);
      data = null;
    }

    // 検証ゲート
    const gate = validateResult(task.type, data, retryAttempt);

    // キャッシュに保存
    resultCache.set(cacheKey, data);

    // 必須タスクでゲート失敗の場合はリトライ
    if (task.required && !gate.passed && retryAttempt < maxRetries) {
      console.warn(`Gate failed for ${task.type}, retrying with adjusted params...`);
      currentParams = adjustParamsForRetry(task.type, currentParams, retryAttempt + 1);
      retryAttempt++;
      continue;
    }

    return {
      taskType: task.type,
      data,
      gate,
      cached: false,
    };
  }

  // 最大リトライ超過
  return {
    taskType: task.type,
    data: null,
    gate: {
      passed: false,
      taskType: task.type,
      resultCount: 0,
      retryAttempt: maxRetries,
      message: '最大リトライ回数超過',
    },
    cached: false,
  };
}

/**
 * パラメータ調整（リトライ時）
 */
function adjustParamsForRetry(
  taskType: TaskType,
  params: Record<string, any>,
  retryAttempt: number
): Record<string, any> {
  const adjusted = { ...params };

  switch (taskType) {
    case 'places_competitors':
    case 'places_nearby':
    case 'places_facilities':
      // radiusを50%ずつ拡大
      if (adjusted.radius) {
        adjusted.radius = Math.floor(adjusted.radius * 1.5);
      }
      // keywordをより一般的に
      if (adjusted.keyword && retryAttempt === 2) {
        const keywords = adjusted.keyword.split(' ');
        adjusted.keyword = keywords[0]; // 最初のキーワードのみ
      }
      break;
  }

  return adjusted;
}

/**
 * 個別タスク実行
 */
async function executeTaskOnce(
  taskType: TaskType,
  params: Record<string, any>,
  keys: ApiKeys,
  plan: ResearchPlan
): Promise<any> {
  const prefCode = plan.area?.prefecture ? PREFECTURE_CODES[plan.area.prefecture] : undefined;

  switch (taskType) {
    case 'estat_population':
      if (!keys.estatAppId || !prefCode) return null;
      return await getPopulationByArea(keys.estatAppId, prefCode);

    case 'estat_business':
      if (!keys.estatAppId || !prefCode) return null;
      return await getBusinessStats(keys.estatAppId, prefCode);

    case 'places_competitors':
      if (!keys.googlePlacesApiKey) return null;
      const query = params.query || `${params.keyword} ${plan.area?.prefecture || ''}`;
      return await textSearch({
        apiKey: keys.googlePlacesApiKey,
        query,
        region: 'jp',
      });

    case 'places_nearby':
      if (!keys.googlePlacesApiKey || !plan.area?.lat || !plan.area?.lng) return null;
      return await nearbySearch({
        apiKey: keys.googlePlacesApiKey,
        lat: plan.area.lat,
        lng: plan.area.lng,
        radius: params.radius || 5000,
        keyword: params.keyword,
      });

    case 'places_facilities':
      if (!keys.googlePlacesApiKey || !plan.area?.lat || !plan.area?.lng) return null;
      return await getAreaFacilities(
        keys.googlePlacesApiKey,
        plan.area.lat,
        plan.area.lng,
        params.radius || 3000
      );

    case 'ads_keywords':
      if (!keys.googleAdsApiKey || !keys.googleAdsDeveloperToken || !keys.googleAdsCustomerId) {
        return null;
      }
      const keywords = params.keywords || [plan.query];
      return await getKeywordMetrics(
        keys.googleAdsDeveloperToken,
        keys.googleAdsCustomerId,
        keys.googleAdsApiKey,
        keywords
      );

    case 'traffic_analysis':
    case 'demographic_trends':
      // これらは将来的に実装可能
      return { status: 'not_implemented' };

    default:
      return null;
  }
}

/**
 * 計画全体を実行
 */
export async function executePlan(
  plan: ResearchPlan,
  keys: ApiKeys
): Promise<ExecutorResult[]> {
  console.log(`[Executor] Executing ${plan.tasks.length} tasks...`);

  const results: ExecutorResult[] = [];

  // 並列実行
  const taskPromises = plan.tasks.map(task => executeTask(task, keys, plan));
  const executorResults = await Promise.all(taskPromises);

  for (const result of executorResults) {
    results.push(result);
    console.log(
      `[Executor] ${result.taskType}: ${result.gate.message} (cached: ${result.cached})`
    );
  }

  // 必須タスクの失敗をチェック
  const requiredTasks = plan.tasks.filter(t => t.required);
  const failedRequired = results.filter(
    r => requiredTasks.some(t => t.type === r.taskType) && !r.gate.passed
  );

  if (failedRequired.length > 0) {
    console.warn(
      `[Executor] ${failedRequired.length} required tasks failed:`,
      failedRequired.map(r => r.taskType)
    );
  }

  return results;
}

/**
 * キャッシュクリア（テスト用）
 */
export function clearCache() {
  resultCache.clear();
}
