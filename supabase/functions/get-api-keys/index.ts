import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get API keys from environment variables (Supabase secrets)
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || null;
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || null;
    const googleCloudTTSKey = Deno.env.get("GOOGLE_CLOUD_TTS_API_KEY") || null;

    // Return API keys (only non-null values)
    const response: {
      openai?: string;
      gemini?: string;
      googleCloudTTS?: string;
    } = {};

    if (openaiKey) {
      response.openai = openaiKey;
    }
    if (geminiKey) {
      response.gemini = geminiKey;
    }
    if (googleCloudTTSKey) {
      response.googleCloudTTS = googleCloudTTSKey;
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in get-api-keys Edge Function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

