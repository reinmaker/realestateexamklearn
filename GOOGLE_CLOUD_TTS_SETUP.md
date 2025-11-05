# Google Cloud Text-to-Speech Setup

## Overview

The app now uses Google Cloud Text-to-Speech for natural, human-like Hebrew voices. The neural voices (WaveNet) sound much more natural than browser TTS.

## Step 1: Get Google Cloud TTS API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Cloud Text-to-Speech API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Cloud Text-to-Speech API"
   - Click **Enable**

4. Create an API key:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **API Key**
   - Copy the API key

## Step 2: Add API Key to Supabase Secrets

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `arhoasurtfurjgfohlgt`
3. Go to **Settings** → **Edge Functions** → **Secrets**
4. Add a new secret:
   - **Name:** `GOOGLE_CLOUD_TTS_API_KEY`
   - **Value:** Your Google Cloud TTS API key

## Step 3: Add to Environment Variables (Optional - for local development)

If you want to use it locally without Supabase Edge Function:

1. Open `.env.local` file
2. Add:
   ```
   GOOGLE_CLOUD_TTS_API_KEY=your-api-key-here
   ```

## Step 4: Deploy Updated Edge Function (if needed)

The Edge Function has been updated to include the Google Cloud TTS key. If you need to redeploy:

```bash
supabase functions deploy get-api-keys
```

## How It Works

1. **Priority:** Google Cloud TTS (neural voices) → Browser TTS → OpenAI TTS
2. **Hebrew Voices:** Uses `he-IL-Wavenet-D` (female neural voice) which sounds very natural
3. **Fallback:** If Google Cloud TTS is not available, it falls back to browser TTS or OpenAI TTS

## Voice Options

The app uses `he-IL-Wavenet-D` (female neural voice). Other available Hebrew WaveNet voices:
- `he-IL-Wavenet-A` (male)
- `he-IL-Wavenet-B` (male)
- `he-IL-Wavenet-C` (female)
- `he-IL-Wavenet-D` (female) - **Currently used**

To change the voice, edit `services/aiService.ts` in the `generateSpeech` function.

## Pricing

Google Cloud Text-to-Speech has a free tier:
- **First 4 million characters per month:** Free
- **After that:** $4 per 1 million characters

For most educational apps, this should be well within the free tier.

## Security

- API keys are stored securely in Supabase secrets
- Keys are never exposed to the client
- Edge Function handles all API calls server-side

