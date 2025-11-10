import { supabase } from './authService';

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

// Check if we're in local development
const isLocalDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' ||
   import.meta.env.DEV);

/**
 * Gets OpenAI API key from environment variables (local) or Supabase Edge Function (production)
 * Returns null if not found (will trigger fallback in aiService)
 */
export async function getOpenAIKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.openai && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.openai;
  }

  // In local development, use environment variables directly (skip Edge Function)
  if (isLocalDev) {
    // Try both VITE_ prefix and original names for compatibility
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

  // In production (Netlify), try Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke('get-api-keys');
    if (!error && data?.openai) {
      apiKeysCache = {
        ...apiKeysCache,
        openai: data.openai,
        timestamp: now,
      };
      return data.openai;
    }
  } catch (error) {
    // Edge Function not available or failed, fall through to env vars
    console.warn('Failed to get API key from Supabase Edge Function, falling back to environment variables:', error);
  }

  // Fallback to environment variables in production
  const apiKey = 
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.OPENAI_API_KEY) ||
    null;
  
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
 * Gets Gemini API key from environment variables (local) or Supabase Edge Function (production)
 * Returns null if not found (will trigger fallback in aiService)
 */
export async function getGeminiKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.gemini && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.gemini;
  }

  // In local development, use environment variables directly (skip Edge Function)
  if (isLocalDev) {
    // Try both VITE_ prefix and original names for compatibility
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

  // In production (Netlify), try Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke('get-api-keys');
    if (!error && data?.gemini) {
      apiKeysCache = {
        ...apiKeysCache,
        gemini: data.gemini,
        timestamp: now,
      };
      return data.gemini;
    }
  } catch (error) {
    // Edge Function not available or failed, fall through to env vars
    console.warn('Failed to get API key from Supabase Edge Function, falling back to environment variables:', error);
  }

  // Fallback to environment variables in production
  const apiKey = 
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) ||
    (typeof import.meta !== 'undefined' && import.meta.env?.GEMINI_API_KEY) ||
    null;
  
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
 * Gets Google Cloud Text-to-Speech API key from environment variables (local) or Supabase Edge Function (production)
 */
export async function getGoogleCloudTTSKey(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.googleCloudTTS && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.googleCloudTTS;
  }

  // In local development, use environment variables directly (skip Edge Function)
  if (isLocalDev) {
    // Try both VITE_ prefix and original names for compatibility
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

  // In production (Netlify), try Supabase Edge Function first
  try {
    const { data, error } = await supabase.functions.invoke('get-api-keys');
    if (!error && data?.googleCloudTTS) {
      apiKeysCache = {
        ...apiKeysCache,
        googleCloudTTS: data.googleCloudTTS,
        timestamp: now,
      };
      return data.googleCloudTTS;
    }
  } catch (error) {
    // Edge Function not available or failed, fall through to env vars
    console.warn('Failed to get API key from Supabase Edge Function, falling back to environment variables:', error);
  }

  // Fallback to environment variables in production
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
