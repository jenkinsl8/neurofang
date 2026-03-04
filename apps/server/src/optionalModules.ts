export type AzurePronunciationResult = {
  score: number;
  words: Array<{ word: string; accuracy: number }>;
};

export async function runAzurePronunciationAssessment(_audioBuffer: Buffer): Promise<AzurePronunciationResult | null> {
  if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
    return null;
  }
  return {
    score: 0,
    words: []
  };
}

export type MediaPipeMetric = {
  timestamp: number;
  metric: string;
  value: number;
};

export function collectMediaPipeWebMetrics(): MediaPipeMetric[] {
  if (process.env.ENABLE_MEDIAPIPE_METRICS !== 'true') {
    return [];
  }
  return [];
}
