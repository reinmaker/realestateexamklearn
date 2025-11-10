// Cache for API keys to avoid repeated fetches
let apiKeysCache: {
  openai: string | null;
  gemini: string | null;
  googleCloudTTS: string | null;
  timestamp: number;
} = {
  openai: null,
  gemini: null,
  googleCloudTTS: null,
  timestamp: 0,
};

// Cache TTL: 1 hour (3600000 ms)
const CACHE_TTL = 3600000;

/**
 * Gets OpenAI API key from Netlify environment variables
 * Returns null if not found (will trigger fallback in aiService)
 * 
 * Note: In Vite, environment variables must be prefixed with VITE_ to be exposed to client-side code
 * Set VITE_OPENAI_API_KEY in Netlify environment variables
 */
export async function getOpenAIKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.openai && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.openai;
  }

  // Use environment variables directly (works in both local dev and Netlify production)
  // Try both VITE_ prefix (required for Vite client-side) and original names for compatibility
  const viteKey = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_OPENAI_API_KEY : undefined;
  const regularKey = typeof import.meta !== 'undefined' ? import.meta.env?.OPENAI_API_KEY : undefined;
  const apiKey = viteKey || regularKey || null;
  
  // Update cache
  if (apiKey) {
    apiKeysCache = {
      ...apiKeysCache,
      openai: apiKey,
      timestamp: now,
    };
  }
  
  return apiKey;
}

/**
 * Gets Gemini API key from Netlify environment variables
 * Returns null if not found (will trigger fallback in aiService)
 * 
 * Note: In Vite, environment variables must be prefixed with VITE_ to be exposed to client-side code
 * Set VITE_GEMINI_API_KEY in Netlify environment variables
 */
export async function getGeminiKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.gemini && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.gemini;
  }

  // Use environment variables directly (works in both local dev and Netlify production)
  // Try both VITE_ prefix (required for Vite client-side) and original names for compatibility
  const viteKey = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GEMINI_API_KEY : undefined;
  const regularKey = typeof import.meta !== 'undefined' ? import.meta.env?.GEMINI_API_KEY : undefined;
  const apiKey = viteKey || regularKey || null;
  
  // Update cache
  if (apiKey) {
    apiKeysCache = {
      ...apiKeysCache,
      gemini: apiKey,
      timestamp: now,
    };
  }
  
  return apiKey;
}

/**
 * Gets Google Cloud Text-to-Speech API key from Netlify environment variables
 * 
 * Note: In Vite, environment variables must be prefixed with VITE_ to be exposed to client-side code
 * Set VITE_GOOGLE_CLOUD_TTS_API_KEY in Netlify environment variables
 */
export async function getGoogleCloudTTSKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.googleCloudTTS && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.googleCloudTTS;
  }

  // Use environment variables directly (works in both local dev and Netlify production)
  // Try both VITE_ prefix (required for Vite client-side) and original names for compatibility
  const apiKey = 
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLOUD_TTS_API_KEY) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.GOOGLE_CLOUD_TTS_API_KEY) ||
    null;
  
  // Update cache
  if (apiKey) {
    apiKeysCache = {
      ...apiKeysCache,
      googleCloudTTS: apiKey,
      timestamp: now,
    };
  }
  
  return apiKey;
}

/**
 * Clears the API keys cache (useful for testing or forced refresh)
 */
export function clearApiKeysCache(): void {
  apiKeysCache = {
    openai: null,
    gemini: null,
    googleCloudTTS: null,
    timestamp: 0,
  };
}
