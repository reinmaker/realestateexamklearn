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
      setTimeout(() => reject(new Error('Edge Function timeout')), 5000)
    );
    
    const invokePromise = supabase.functions.invoke('get-api-keys', {
      method: 'POST',
    });

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;

    if (error) {
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

  // Fetch from Supabase
  const keys = await fetchApiKeysFromSupabase();
  
  // Update cache
  apiKeysCache = {
    openai: keys.openai,
    gemini: keys.gemini,
    timestamp: now,
  };

  return keys.openai;
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

  // Fetch from Supabase
  const keys = await fetchApiKeysFromSupabase();
  
  // Update cache
  apiKeysCache = {
    openai: keys.openai,
    gemini: keys.gemini,
    timestamp: now,
  };

  return keys.gemini;
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

