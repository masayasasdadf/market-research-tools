export interface ApiKeys {
  estatAppId: string;
  geminiApiKey: string;
  googlePlacesApiKey: string;
  googleAdsApiKey: string;
  googleAdsDeveloperToken: string;
  googleAdsCustomerId: string;
}

export interface LocationResult {
  name: string;
  prefecture: string;
  city: string;
  lat: number;
  lng: number;
  score: number;
  reasons: string[];
  population?: number;
  competitorCount?: number;
  searchDemand?: number;
  trafficVolume?: string;
  additionalInfo: Record<string, string | number>;
}

export interface AnalysisResult {
  query: string;
  type: 'store_location' | 'signage_location' | 'general_research';
  summary: string;
  locations: LocationResult[];
  timestamp: string;
  rawData?: Record<string, any>; // 汎用調査用の生データ
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  analysis?: AnalysisResult;
  isLoading?: boolean;
}

// === 新しい3フェーズアーキテクチャの型定義 ===

export type TaskType =
  | 'estat_population'      // e-Stat人口データ
  | 'estat_business'        // e-Stat事業所データ
  | 'places_competitors'    // Google Places競合検索
  | 'places_facilities'     // Google Places施設検索
  | 'places_nearby'         // Google Places周辺検索
  | 'ads_keywords'          // Google Ads検索需要
  | 'traffic_analysis'      // 交通量分析（POI密度など）
  | 'demographic_trends';   // 人口動態分析

export interface ResearchTask {
  type: TaskType;
  params: Record<string, any>; // 各タスク固有のパラメータ
  required: boolean;           // 必須タスクかどうか
}

export interface ResearchPlan {
  query: string;
  intent: 'store_location' | 'signage_location' | 'general_research';
  area?: {
    prefecture?: string;
    city?: string;
    lat?: number;
    lng?: number;
    radius?: number; // meters
  };
  tasks: ResearchTask[];
  outputFormat: 'locations' | 'data_summary' | 'mixed';
}

export interface ValidationGate {
  passed: boolean;
  taskType: TaskType;
  resultCount: number;
  retryAttempt: number;
  message: string;
}

export interface ExecutorResult {
  taskType: TaskType;
  data: any;
  gate: ValidationGate;
  cached: boolean;
}
