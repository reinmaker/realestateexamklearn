import { supabase } from './authService';

// Cache for API keys to avoid repeated fetches
let apiKeysCache: {
  openai: string | null;
  gemini: string | null;
  timestamp: number;
} = {
  openai: null,
  gemini: null,
  timestamp: 0,
};

// Cache TTL: 1 hour (3600000 ms)
const CACHE_TTL = 3600000;

/**
 * Fetches API keys from Supabase secrets
 * Uses Edge Function to securely retrieve secrets
 */
async function fetchApiKeysFromSupabase(): Promise<{ openai: string; gemini: string }> {
  try {
    // Call Supabase Edge Function to get API keys
    // The Edge Function will access Supabase secrets securely
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Edge Function timeout')), 3000)
    );
    
    const invokePromise = supabase.functions.invoke('get-api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await Promise.race([invokePromise, timeoutPromise]) as any;
    const { data, error } = result || {};

    if (error) {
      // Check if it's a CORS or network error (common in production)
      const errorMsg = error?.message || String(error) || '';
      if (errorMsg.includes('CORS') || errorMsg.includes('Failed to send') || errorMsg.includes('network')) {
        console.warn('Edge Function CORS/network error, will use environment variables:', errorMsg);
        throw new Error('EDGE_FUNCTION_UNAVAILABLE');
      }
      console.error('Error fetching API keys from Supabase:', error);
      throw error;
    }

    if (!data || !data.openai || !data.gemini) {
      throw new Error('API keys not found in Supabase secrets');
    }

    return {
      openai: data.openai,
      gemini: data.gemini,
    };
  } catch (error) {
    // If it's a timeout or network error, re-throw a special error to indicate fallback should happen
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('timeout') || errorMsg.includes('EDGE_FUNCTION_UNAVAILABLE') || errorMsg.includes('CORS')) {
      throw new Error('EDGE_FUNCTION_UNAVAILABLE');
    }
    console.error('Failed to fetch API keys from Supabase:', error);
    throw error;
  }
}

/**
 * Gets OpenAI API key from Supabase secrets (with caching)
 */
export async function getOpenAIKey(): Promise<string> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.openai && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.openai;
  }

  try {
    // Fetch from Supabase
    const keys = await fetchApiKeysFromSupabase();
    
    // Update cache
    apiKeysCache = {
      openai: keys.openai,
      gemini: keys.gemini,
      timestamp: now,
    };

    return keys.openai;
  } catch (error) {
    // If Edge Function is unavailable, return null to trigger env fallback
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('EDGE_FUNCTION_UNAVAILABLE')) {
      return null as any; // Will trigger fallback in aiService
    }
    throw error;
  }
}

/**
 * Gets Gemini API key from Supabase secrets (with caching)
 */
export async function getGeminiKey(): Promise<string> {
  // Check cache first
  const now = Date.now();
  if (apiKeysCache.gemini && (now - apiKeysCache.timestamp) < CACHE_TTL) {
    return apiKeysCache.gemini;
  }

  try {
    // Fetch from Supabase
    const keys = await fetchApiKeysFromSupabase();
    
    // Update cache
    apiKeysCache = {
      openai: keys.openai,
      gemini: keys.gemini,
      timestamp: now,
    };

    return keys.gemini;
  } catch (error) {
    // If Edge Function is unavailable, return null to trigger env fallback
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('EDGE_FUNCTION_UNAVAILABLE')) {
      return null as any; // Will trigger fallback in aiService
    }
    throw error;
  }
}

/**
 * Clears the API keys cache (useful for testing or forced refresh)
 */
export function clearApiKeysCache(): void {
  apiKeysCache = {
    openai: null,
    gemini: null,
    timestamp: 0,
  };
}

