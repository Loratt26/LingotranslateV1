export interface GlossaryEntry {
  id: string;
  source: string;
  target: string;
  sourceLang: string;
  targetLang: string;
  context?: string;
  priority: number;
  createdAt: number;
  usageCount: number;
}

export interface TranslationResult {
  translation: string;
  alternatives: string[];
  glossaryHitsApplied: string[];
  inputTokens: number;
  outputTokens: number;
}
