# Supabase Edge Function Setup for API Keys

## Overview

The app now fetches API keys from Supabase secrets instead of environment variables. This requires deploying a Supabase Edge Function.

## Step 1: Deploy the Edge Function

1. Install Supabase CLI (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref arhoasurtfurjgfohlgt
   ```

4. Deploy the Edge Function:
   ```bash
   supabase functions deploy get-api-keys
   ```

## Step 2: Set API Keys as Secrets in Supabase

The API keys are already stored in Supabase secrets. The Edge Function will automatically access them via `Deno.env.get()`.

If you need to update the secrets:

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `arhoasurtfurjgfohlgt`
3. Go to **Settings** → **Edge Functions** → **Secrets**
4. Ensure the following secrets are set:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `GEMINI_API_KEY` - Your Google Gemini API key

## Step 3: Verify the Edge Function

After deployment, the Edge Function will be available at:
```
https://arhoasurtfurjgfohlgt.supabase.co/functions/v1/get-api-keys
```

The function will return:
```json
{
  "openai": "your-openai-key",
  "gemini": "your-gemini-key"
}
```

## How It Works

1. **Client-side**: The app calls `getOpenAIKey()` or `getGeminiKey()` from `apiKeysService.ts`
2. **Service**: The service calls the Supabase Edge Function `get-api-keys`
3. **Edge Function**: The Edge Function securely reads the API keys from Supabase secrets and returns them
4. **Caching**: API keys are cached for 1 hour to avoid repeated fetches

## Fallback

If the Supabase Edge Function fails or is not available (e.g., CORS issues in production), the code will automatically fall back to reading from environment variables (`process.env.OPENAI_API_KEY` and `process.env.GEMINI_API_KEY`).

### Setting Environment Variables in Netlify (If Edge Function Has CORS Issues)

If you're experiencing CORS errors with the Edge Function in production, you can use environment variables directly:

1. Go to your [Netlify Dashboard](https://app.netlify.com/)
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Add the following environment variables:
   - **Key:** `OPENAI_API_KEY`
     - **Value:** Your OpenAI API Key
   - **Key:** `GEMINI_API_KEY`
     - **Value:** Your Google Gemini API Key

The application will automatically detect when the Edge Function is unavailable and use these environment variables instead.

## Security

- API keys are stored securely in Supabase secrets
- Edge Functions run server-side, so keys are never exposed to the client
- The Edge Function should have proper authentication/authorization if needed
- Consider adding rate limiting to the Edge Function

