// ── Formality Mode (replaces tone + context dual-dropdown) ────────────────────
export const FORMALITY_OPTIONS = [
    { value: 'neutral', label: 'Neutral', emoji: '⚖', hint: 'Balanced, faithful translation' },
    { value: 'friendly', label: 'Friendly', emoji: '😊', hint: 'Warm and conversational' },
    { value: 'professional', label: 'Professional', emoji: '👔', hint: 'Polished formal register' },
    { value: 'concise', label: 'Concise', emoji: '✂', hint: 'Short, direct, no filler' },
    { value: 'persuasive', label: 'Persuasive', emoji: '🎯', hint: 'Compelling, action-oriented' },
    { value: 'support', label: 'Support Agent', emoji: '🎧', hint: 'Empathetic human support tone' },
];
// Legacy export alias
export const TONE_OPTIONS = FORMALITY_OPTIONS;
export const FORMALITY_INSTRUCTIONS = {
    neutral: '',
    friendly: 'Write with a warm, natural, conversational register — as a friendly colleague would.',
    professional: 'Write with polished, formal language appropriate for business communications.',
    concise: 'Be maximally direct. Remove all filler words. Prefer short, punchy sentences.',
    persuasive: 'Write with compelling, active-voice language that motivates action. Be energetic but credible.',
    support: 'Write as an empathetic human support agent: warm, clear, reassuring, solution-focused.',
};
// Legacy export alias
export const TONE_INSTRUCTIONS = FORMALITY_INSTRUCTIONS;
// ── localStorage helpers ──────────────────────────────────────────────────────
const FORMALITY_KEY = 'lingo_formality';
export function loadFormality() {
    // also try legacy key 'lingo_tone'
    const stored = (localStorage.getItem(FORMALITY_KEY) || localStorage.getItem('lingo_tone'));
    return stored && FORMALITY_OPTIONS.some((t) => t.value === stored) ? stored : 'neutral';
}
export function saveFormality(mode) {
    localStorage.setItem(FORMALITY_KEY, mode);
}
// Legacy aliases
export const loadTone = loadFormality;
export const saveTone = saveFormality;
