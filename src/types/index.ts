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
  type: 'store_location' | 'signage_location' | 'general';
  summary: string;
  locations: LocationResult[];
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  analysis?: AnalysisResult;
  isLoading?: boolean;
}
