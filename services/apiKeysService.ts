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
 * Gets OpenAI API key from environment variables
 * Returns null if not found (will trigger fallback in aiService)
 */
export async function getOpenAIKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.openai && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.openai;
  }

  // Get from environment variable
  const apiKey = process.env.OPENAI_API_KEY || null;
  
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
 * Gets Gemini API key from environment variables
 * Returns null if not found (will trigger fallback in aiService)
 */
export async function getGeminiKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.gemini && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.gemini;
  }

  // Get from environment variable
  const apiKey = process.env.GEMINI_API_KEY || null;
  
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
 * Gets Google Cloud Text-to-Speech API key from environment variables
 */
export async function getGoogleCloudTTSKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.googleCloudTTS && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.googleCloudTTS;
  }

  // Get from environment variable
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY || null;
  
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
