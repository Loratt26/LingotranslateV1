export type ContextMode =
  | 'general'
  | 'customer-support'
  | 'marketing'
  | 'legal'
  | 'technical'
  | 'friendly'
  | 'formal';

export type RewriteStyle = 'friendly' | 'professional' | 'simple' | 'persuasive' | 'shorter';

export interface ContextOption {
  value: ContextMode;
  label: string;
  hint: string;
}

export const CONTEXT_OPTIONS: ContextOption[] = [
  { value: 'general',          label: 'General',          hint: 'Balanced, natural translation' },
  { value: 'customer-support', label: 'Soporte',          hint: 'Warm, empathetic tone' },
  { value: 'marketing',        label: 'Marketing',        hint: 'Persuasive & engaging' },
  { value: 'legal',            label: 'Legal',            hint: 'Precise, literal' },
  { value: 'technical',        label: 'Técnico',          hint: 'Exact terminology' },
  { value: 'friendly',         label: 'Informal',         hint: 'Casual, conversational' },
  { value: 'formal',           label: 'Formal',           hint: 'Professional register' },
];

export const CONTEXT_INSTRUCTIONS: Record<ContextMode, string> = {
  'general':          '',
  'customer-support': 'Use a warm, empathetic, and natural tone — write as a helpful human support agent would.',
  'marketing':        'Use engaging, persuasive language with a natural call-to-action feel. Be compelling.',
  'legal':            'Be precise and literal. Use exact legal terminology. Avoid paraphrasing or creative phrasing.',
  'technical':        'Use exact technical terminology. Do not simplify, generalize, or rephrase technical concepts.',
  'friendly':         'Use a casual, warm, and conversational tone. Write as you would to a friend.',
  'formal':           'Use polite, professional, and formally structured language.',
};

export const REWRITE_INSTRUCTIONS: Record<RewriteStyle, string> = {
  'friendly':     'Rewrite with a warm, conversational, and friendly tone. Keep it natural.',
  'professional': 'Rewrite with a polished, formal, and professional style.',
  'simple':       'Simplify — use clearer, shorter sentences. Remove jargon. Make it accessible.',
  'persuasive':   'Rewrite to be more compelling and persuasive. Use active voice and strong language.',
  'shorter':      'Significantly shorten the text while preserving all key meaning.',
};

export const REWRITE_LABELS: Record<RewriteStyle, string> = {
  'friendly':     '😊 Más cercano',
  'professional': '👔 Más formal',
  'simple':       '✨ Simplificar',
  'persuasive':   '🎯 Más persuasivo',
  'shorter':      '✂ Acortar',
};
