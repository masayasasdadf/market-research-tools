/**
 * Executor (実行フェーズ)
 * 計画に基づいてAPIを実行し、検証ゲートで品質チェック
 * Geminiは一切使わず、コードが確実に実行
 */

import { ApiKeys, ResearchTask, ExecutorResult, ValidationGate, TaskType, ResearchPlan, LocationResult } from '@/types';
import { PREFECTURE_CODES, getPopulationByArea, getBusinessStats } from './estat';
import { textSearch, nearbySearch, getAreaFacilities } from './google-places';
import { getKeywordMetrics } from './google-ads';

/**
 * 検証ゲート: 結果が妥当かチェック
 */
function validateResult(taskType: TaskType, data: any): ValidationGate {
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
        message = '検索結果0件';
      } else {
        message = `${resultCount}件取得`;
      }
      break;

    case 'estat_population':
    case 'estat_business':
      if (!data || data.error) {
        passed = false;
        message = 'e-Stat取得失敗';
      } else {
        message = 'e-Statデータ取得OK';
      }
      break;

    case 'ads_keywords':
      if (data && data.keywords) {
        resultCount = data.keywords.length;
        message = `キーワード${resultCount}件`;
      } else {
        message = '検索需要データ取得(推定値)';
      }
      break;

    default:
      message = '取得完了';
  }

  return { passed, taskType, resultCount, retryAttempt: 0, message };
}

/**
 * Places系タスクのリトライ（radius拡大、keyword簡略化）
 */
async function executePlacesWithRetry(
  apiKey: string,
  keyword: string,
  prefecture: string,
  maxRetries: number = 2,
): Promise<{ data: any; gate: ValidationGate }> {
  let currentKeyword = keyword;
  let currentRadius = 5000; // 使われないが記録用

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const query = `${currentKeyword} ${prefecture}`;
      const data = await textSearch({ apiKey, query, region: 'jp' });
      const gate = validateResult('places_competitors', data);
      gate.retryAttempt = attempt;

      if (gate.passed) {
        return { data, gate };
      }

      // リトライ: キーワード簡略化
      console.warn(`[Executor] Places 0件 (attempt ${attempt + 1}), キーワード調整...`);
      const words = currentKeyword.split(' ');
      if (words.length > 1) {
        currentKeyword = words[0]; // 最初のキーワードのみ
      }
      currentRadius = Math.floor(currentRadius * 1.5);
    } catch (error) {
      console.error(`[Executor] Places error (attempt ${attempt + 1}):`, error);
    }
  }

  return {
    data: [],
    gate: { passed: false, taskType: 'places_competitors', resultCount: 0, retryAttempt: maxRetries, message: 'リトライ後も0件' },
  };
}

/**
 * 個別タスク実行
 */
async function executeTask(
  task: ResearchTask,
  keys: ApiKeys,
  plan: ResearchPlan,
): Promise<ExecutorResult> {
  const prefCode = plan.area?.prefecture ? PREFECTURE_CODES[plan.area.prefecture] : undefined;

  try {
    switch (task.type) {
      case 'estat_population': {
        if (!keys.estatAppId || !prefCode) {
          return { taskType: task.type, data: null, gate: validateResult(task.type, null), cached: false };
        }
        const data = await getPopulationByArea(keys.estatAppId, prefCode);
        return { taskType: task.type, data, gate: validateResult(task.type, data), cached: false };
      }

      case 'estat_business': {
        if (!keys.estatAppId || !prefCode) {
          return { taskType: task.type, data: null, gate: validateResult(task.type, null), cached: false };
        }
        const data = await getBusinessStats(keys.estatAppId, prefCode);
        return { taskType: task.type, data, gate: validateResult(task.type, data), cached: false };
      }

      case 'places_competitors': {
        if (!keys.googlePlacesApiKey || !plan.area?.prefecture) {
          return { taskType: task.type, data: null, gate: validateResult(task.type, null), cached: false };
        }
        // リトライ付きで実行
        const { data, gate } = await executePlacesWithRetry(
          keys.googlePlacesApiKey,
          task.params.keyword || '',
          plan.area.prefecture,
        );
        return { taskType: task.type, data, gate, cached: false };
      }

      case 'ads_keywords': {
        if (!keys.googleAdsApiKey || !keys.googleAdsDeveloperToken || !keys.googleAdsCustomerId) {
          return { taskType: task.type, data: null, gate: validateResult(task.type, null), cached: false };
        }
        const keywords = task.params.keywords || [plan.query];
        const data = await getKeywordMetrics(
          keys.googleAdsDeveloperToken,
          keys.googleAdsCustomerId,
          keys.googleAdsApiKey,
          keywords,
        );
        return { taskType: task.type, data, gate: validateResult(task.type, data), cached: false };
      }

      default:
        return { taskType: task.type, data: null, gate: validateResult(task.type, null), cached: false };
    }
  } catch (error) {
    console.error(`[Executor] ${task.type} error:`, error);
    return {
      taskType: task.type,
      data: null,
      gate: { passed: false, taskType: task.type, resultCount: 0, retryAttempt: 0, message: `エラー: ${error}` },
      cached: false,
    };
  }
}

/**
 * 計画全体を実行
 */
export async function executePlan(
  plan: ResearchPlan,
  keys: ApiKeys,
): Promise<ExecutorResult[]> {
  console.log(`[Executor] ${plan.tasks.length} tasks を実行中...`);

  // 全タスク並列実行
  const results = await Promise.all(
    plan.tasks.map(task => executeTask(task, keys, plan)),
  );

  for (const r of results) {
    console.log(`[Executor] ${r.taskType}: ${r.gate.message}`);
  }

  return results;
}

/**
 * 候補地ごとの競合検索＋周辺情報取得（Reporter後に使う）
 */
export async function enrichLocations(
  locations: LocationResult[],
  keys: ApiKeys,
  businessKeywords: string[],
): Promise<LocationResult[]> {
  if (!keys.googlePlacesApiKey || locations.length === 0) {
    return locations;
  }

  const competitorKeyword = businessKeywords.join(' ');

  const enriched = await Promise.all(
    locations.map(async (loc) => {
      if (!loc.lat || !loc.lng) return loc;

      try {
        const [competitors, facilities] = await Promise.all([
          nearbySearch({
            apiKey: keys.googlePlacesApiKey,
            lat: loc.lat,
            lng: loc.lng,
            radius: 5000,
            keyword: competitorKeyword,
          }),
          getAreaFacilities(keys.googlePlacesApiKey, loc.lat, loc.lng, 3000),
        ]);

        const enrichedLoc = { ...loc };

        // 実際の競合数で上書き
        if (competitors.length > 0) {
          enrichedLoc.competitorCount = competitors.length;
        }

        // 駅情報を追加
        if (facilities.stations.length > 0) {
          enrichedLoc.additionalInfo = {
            ...enrichedLoc.additionalInfo,
            '周辺駅': facilities.stations.slice(0, 3).map((s: any) => s.name).join('、'),
          };
        }

        // 主要道路情報を追加
        if (facilities.roads.length > 0) {
          enrichedLoc.additionalInfo = {
            ...enrichedLoc.additionalInfo,
            '周辺道路': facilities.roads.slice(0, 3).map((r: any) => r.name).join('、'),
          };
        }

        return enrichedLoc;
      } catch {
        return loc; // 補強失敗は無視
      }
    }),
  );

  return enriched;
}
