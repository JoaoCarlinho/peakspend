export interface AccuracyMetrics {
  overallAccuracy: number;
  categoryAccuracy: Record<string, number>;
  predictionConfidenceAvg: number;
  totalPredictions: number;
  correctPredictions: number;
}

export interface AccuracyTrendPoint {
  date: string;
  accuracy: number;
}

export interface CategoryBreakdown {
  category: string;
  accuracy: number;
  predictions: number;
}

export interface RecentError {
  merchant: string;
  predicted: string;
  actual: string;
  date: string;
}

export interface ImprovementMetrics {
  accuracyChange30Days: number;
  accuracyChange7Days: number;
  totalFeedbackCount: number;
}

export interface PerformanceDashboard {
  currentAccuracy: number;
  accuracyTrend: AccuracyTrendPoint[];
  categoryBreakdown: CategoryBreakdown[];
  improvementMetrics: ImprovementMetrics;
  recentErrors: RecentError[];
}

export interface UserImprovementMetrics {
  accuracyImprovement: number;
  learningRate: number;
  userEngagement: number;
  timeSavings: {
    manualCategorizationsBefore: number;
    autoCategorizationsNow: number;
    percentageReduction: number;
  };
}
