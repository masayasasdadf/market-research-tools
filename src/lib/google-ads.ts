/**
 * Google Ads API / Keyword Planner integration
 * 検索ボリューム・キーワード需要データの取得
 *
 * NOTE: Google Ads APIは認証が複雑なため、ここではキーワードプランナーの
 * 代替としてシンプルな推定ロジックを提供し、API利用可能時に切り替え可能にしている
 */

interface KeywordMetrics {
  keyword: string;
  avgMonthlySearches: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH';
  competitionIndex: number;
  topOfPageBidLow: number;
  topOfPageBidHigh: number;
}

interface SearchDemandResult {
  keywords: KeywordMetrics[];
  totalMonthlySearches: number;
  avgCompetition: string;
}

/**
 * Google Ads APIでキーワード検索ボリュームを取得
 * (API利用時)
 */
export async function getKeywordMetrics(
  developerToken: string,
  customerId: string,
  apiKey: string,
  keywords: string[],
  geoTargetCode?: string
): Promise<SearchDemandResult> {
  // Google Ads API v16 Keyword Planner
  const url = `https://googleads.googleapis.com/v16/customers/${customerId}:generateKeywordIdeas`;

  try {
    const body = {
      keywordSeed: { keywords },
      language: 'languageConstants/1005', // Japanese
      geoTargetConstants: geoTargetCode
        ? [`geoTargetConstants/${geoTargetCode}`]
        : ['geoTargetConstants/2392'], // Japan
      keywordPlanNetwork: 'GOOGLE_SEARCH',
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'developer-token': developerToken,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('Google Ads API unavailable, using estimation');
      return estimateSearchDemand(keywords);
    }

    const data = await res.json();
    const keywordMetrics: KeywordMetrics[] = (data.results || []).map((r: any) => ({
      keyword: r.text,
      avgMonthlySearches: r.keywordIdeaMetrics?.avgMonthlySearches || 0,
      competition: r.keywordIdeaMetrics?.competition || 'MEDIUM',
      competitionIndex: r.keywordIdeaMetrics?.competitionIndex || 50,
      topOfPageBidLow: r.keywordIdeaMetrics?.lowTopOfPageBidMicros / 1000000 || 0,
      topOfPageBidHigh: r.keywordIdeaMetrics?.highTopOfPageBidMicros / 1000000 || 0,
    }));

    return {
      keywords: keywordMetrics,
      totalMonthlySearches: keywordMetrics.reduce((sum, k) => sum + k.avgMonthlySearches, 0),
      avgCompetition: calculateAvgCompetition(keywordMetrics),
    };
  } catch (error) {
    console.warn('Google Ads API error, using estimation:', error);
    return estimateSearchDemand(keywords);
  }
}

/**
 * APIが利用できない場合の検索需要推定
 */
function estimateSearchDemand(keywords: string[]): SearchDemandResult {
  const estimates: KeywordMetrics[] = keywords.map(keyword => {
    // キーワードの特性に基づく簡易推定
    const baseVolume = keyword.length > 6 ? 500 : 2000;
    const localMultiplier = keyword.includes('県') || keyword.includes('市') ? 0.3 : 1.0;
    const keywordSeed = Array.from(keyword).reduce((sum, c) => sum + c.charCodeAt(0), 0);
    const variation = 0.75 + (keywordSeed % 50) / 100;
    const estimated = Math.round(baseVolume * localMultiplier * variation);

    return {
      keyword,
      avgMonthlySearches: estimated,
      competition: estimated > 1000 ? 'HIGH' : estimated > 300 ? 'MEDIUM' : 'LOW',
      competitionIndex: Math.min(100, Math.round(estimated / 20)),
      topOfPageBidLow: Math.round(estimated * 0.05),
      topOfPageBidHigh: Math.round(estimated * 0.15),
    };
  });

  return {
    keywords: estimates,
    totalMonthlySearches: estimates.reduce((sum, k) => sum + k.avgMonthlySearches, 0),
    avgCompetition: calculateAvgCompetition(estimates),
  };
}

function calculateAvgCompetition(metrics: KeywordMetrics[]): string {
  if (metrics.length === 0) return 'MEDIUM';
  const avg = metrics.reduce((sum, m) => sum + m.competitionIndex, 0) / metrics.length;
  if (avg > 66) return 'HIGH';
  if (avg > 33) return 'MEDIUM';
  return 'LOW';
}
