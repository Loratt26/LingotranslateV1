import { franc } from 'franc-min';
import { generateOpenAIText } from './openai-client';
const LANG_NAMES = {
    es: 'Espanol',
    en: 'Ingles',
    fr: 'Frances',
    it: 'Italiano',
    de: 'Aleman',
    pt: 'Portugues',
    'pt-BR': 'Portugues (Brasil)',
    nl: 'Neerlandes',
    sv: 'Sueco',
    ar: 'Arabe',
    ko: 'Coreano',
    ja: 'Japones',
    'zh-CN': 'Chino Simplificado',
    'zh-TW': 'Chino Tradicional',
    zh: 'Chino',
    cs: 'Checo',
    fi: 'Finlandes',
    el: 'Griego',
    pl: 'Polaco',
    ru: 'Ruso',
    tr: 'Turco',
};
const FRANC_TO_LANG_CODE = {
    arb: 'ar',
    ara: 'ar',
    ces: 'cs',
    cmn: 'zh-CN',
    deu: 'de',
    ell: 'el',
    eng: 'en',
    fin: 'fi',
    fra: 'fr',
    ita: 'it',
    jpn: 'ja',
    kor: 'ko',
    nld: 'nl',
    pol: 'pl',
    por: 'pt',
    rus: 'ru',
    spa: 'es',
    swe: 'sv',
    tur: 'tr',
    zho: 'zh-CN',
};
export function getLanguageDisplayName(code) {
    return LANG_NAMES[code] || code.toUpperCase();
}
const AI_DETECTION_CACHE_TTL_MS = 5 * 60 * 1000;
const AI_DETECTION_CACHE_LIMIT = 180;
const aiDetectionCache = new Map();
function normalizeLatin(text) {
    return text
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
function countMatches(text, pattern) {
    return (text.match(pattern) || []).length;
}
function buildDetectionCacheKey(text) {
    const normalized = text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    return `${normalized.slice(0, 180)}|${normalized.slice(-80)}|${normalized.length}`;
}
function getCachedAIDetection(text) {
    const key = buildDetectionCacheKey(text);
    if (!key)
        return null;
    const cached = aiDetectionCache.get(key);
    if (!cached)
        return null;
    if (Date.now() - cached.timestamp > AI_DETECTION_CACHE_TTL_MS) {
        aiDetectionCache.delete(key);
        return null;
    }
    aiDetectionCache.delete(key);
    aiDetectionCache.set(key, cached);
    return cached.code;
}
function setCachedAIDetection(text, code) {
    const key = buildDetectionCacheKey(text);
    if (!key)
        return;
    aiDetectionCache.delete(key);
    aiDetectionCache.set(key, { code, timestamp: Date.now() });
    if (aiDetectionCache.size <= AI_DETECTION_CACHE_LIMIT)
        return;
    const oldestKey = aiDetectionCache.keys().next().value;
    if (oldestKey !== undefined)
        aiDetectionCache.delete(oldestKey);
}
function normalizeDetectedCode(rawCode, fallback) {
    const code = rawCode.trim().toLowerCase().replace(/[^a-z\-]/g, '');
    if (!code)
        return fallback;
    if (code === 'pt-br')
        return 'pt-BR';
    if (code === 'zh-cn' || code === 'zh')
        return 'zh-CN';
    if (code === 'zh-tw')
        return 'zh-TW';
    return code;
}
export function detectLanguageFast(text) {
    const raw = text.trim();
    const lowered = raw.toLowerCase();
    const normalized = normalizeLatin(raw);
    if (!raw)
        return { code: 'es', confidence: 'low' };
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(lowered))
        return { code: 'ja', confidence: 'high' };
    if (/[\uac00-\ud7af]/.test(lowered))
        return { code: 'ko', confidence: 'high' };
    if (/[\u4e00-\u9fff]/.test(lowered))
        return { code: 'zh-CN', confidence: 'high' };
    if (/[\u0600-\u06ff]/.test(lowered))
        return { code: 'ar', confidence: 'high' };
    if (/[\u0400-\u04ff]/.test(lowered))
        return { code: 'ru', confidence: 'high' };
    if (/[\u0370-\u03ff]/.test(lowered))
        return { code: 'el', confidence: 'high' };
    if (/[\u00f1\u00bf\u00a1]/i.test(raw))
        return { code: 'es', confidence: 'high' };
    if (/[\u00e3\u00f5\u00e7]/i.test(raw))
        return { code: 'pt', confidence: 'high' };
    if (/[\u00e4\u00f6\u00fc\u00df]/i.test(raw))
        return { code: 'de', confidence: 'high' };
    const scores = [
        {
            code: 'es',
            score: countMatches(normalized, /\b(el|la|los|las|que|como|tambien|pero|puede|esta|porque|tiene|para|donde|cuando|desde|ahora|siempre|despues|antes|sobre|entre|hasta|segun|todavia|aqui|alli|nosotros|ustedes|ellos|nuestro|gracias|pedido|ayuda|ayudarte|cliente|cambio|necesito|quiero|hola|buenos|dias|disculpa|favor)\b/g),
        },
        {
            code: 'pt',
            score: countMatches(normalized, /\b(voce|nao|tambem|sao|entao|muito|mais|pode|onde|quando|desde|agora|sempre|depois|antes|sobre|entre|ate|segundo|ainda|aqui|ali|nosso|eles|trabalho|tempo|maneira|forma|obrigado|ola|bom|dia|favor)\b/g),
        },
        {
            code: 'en',
            score: countMatches(normalized, /\b(the|and|you|your|please|thanks|thank|hello|hi|order|customer|support|refund|exchange|shipping|today|tomorrow|can|could|would|should|need|want|help|issue|available|sorry)\b/g),
        },
        {
            code: 'fr',
            score: countMatches(normalized, /\b(le|la|les|des|une|vous|nous|avec|pour|merci|bonjour|commande|client|aide|aujourd|demain|pouvez|souhaite|besoin)\b/g),
        },
        {
            code: 'it',
            score: countMatches(normalized, /\b(il|lo|la|gli|che|come|grazie|ciao|ordine|cliente|aiuto|oggi|domani|posso|puoi|bisogno)\b/g),
        },
        {
            code: 'de',
            score: countMatches(normalized, /\b(der|die|das|und|sie|wir|bitte|danke|hallo|bestellung|kunde|hilfe|heute|morgen|konnen|brauche)\b/g),
        },
    ].sort((a, b) => b.score - a.score);
    const [best, second] = scores;
    const spanishScore = scores.find((score) => score.code === 'es')?.score ?? 0;
    const portugueseScore = scores.find((score) => score.code === 'pt')?.score ?? 0;
    if (best.code === 'pt' && spanishScore > 0 && portugueseScore <= spanishScore) {
        return { code: 'es', confidence: 'medium' };
    }
    if (best.score >= 2 && best.score >= second.score + 1) {
        return { code: best.code, confidence: 'high' };
    }
    if (best.score === 1 && best.score > second.score && raw.length <= 80) {
        return { code: best.code, confidence: 'high' };
    }
    if (best.score > second.score) {
        return { code: best.code, confidence: 'medium' };
    }
    if (/[\u00e0\u00e2\u00e7\u00e8\u00e9\u00ea\u00eb\u00ee\u00ef\u00f4\u00f9\u00fb\u00ff\u0153]/i.test(raw)) {
        return { code: 'fr', confidence: 'medium' };
    }
    if (/[\u00e0\u00e8\u00ec\u00f2\u00f9]/i.test(raw)) {
        return { code: 'it', confidence: 'medium' };
    }
    if (raw.length >= 16) {
        const francCode = franc(raw, {
            minLength: 10,
            only: Object.keys(FRANC_TO_LANG_CODE),
        });
        const detectedCode = FRANC_TO_LANG_CODE[francCode];
        if (detectedCode) {
            return {
                code: detectedCode,
                confidence: raw.length >= 50 ? 'high' : 'medium',
            };
        }
    }
    return { code: best.score > 0 ? best.code : 'es', confidence: 'low' };
}
/**
 * Detect language with a local fast path first.
 * The AI call is reserved for ambiguous auto-detect cases.
 */
export async function detectLanguageAI(text, apiKey, signal) {
    const trimmed = text.trim();
    if (trimmed.length < 5 || !apiKey.trim())
        return detectLanguageFallback(text);
    const fastDetection = detectLanguageFast(text);
    if (fastDetection.confidence === 'high')
        return fastDetection.code;
    const cached = getCachedAIDetection(text);
    if (cached) {
        if (fastDetection.confidence !== 'low' &&
            cached !== fastDetection.code &&
            ((cached === 'pt' || cached === 'pt-BR') && fastDetection.code === 'es')) {
            return fastDetection.code;
        }
        return cached;
    }
    try {
        const result = await generateOpenAIText({
            maxOutputTokens: 8,
            temperature: 0,
            signal,
            system: `Detect the language. Return only one ISO code: es, en, fr, it, de, pt, pt-BR, nl, sv, ar, ko, ja, zh-CN, zh-TW, cs, fi, el, pl, ru, or tr. No explanation.`,
            input: trimmed.slice(0, 360),
        }, apiKey);
        const fallbackCode = detectLanguageFallback(text);
        const normalizedCode = normalizeDetectedCode(result.text, fallbackCode);
        const stabilizedCode = fastDetection.confidence !== 'low' &&
            ((normalizedCode === 'pt' || normalizedCode === 'pt-BR') && fastDetection.code === 'es')
            ? fastDetection.code
            : normalizedCode;
        setCachedAIDetection(text, stabilizedCode);
        return stabilizedCode;
    }
    catch (err) {
        if (err.name === 'AbortError')
            throw err;
        return detectLanguageFallback(text);
    }
}
export function detectLanguageFallback(text) {
    return detectLanguageFast(text).code;
}
export function detectLanguage(text) {
    return detectLanguageFallback(text);
}
