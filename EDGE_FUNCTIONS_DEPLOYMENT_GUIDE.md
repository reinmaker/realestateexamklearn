# Supabase Edge Functions Deployment Guide

This guide will help you deploy the required Edge Functions to Supabase.

## Required Functions to Deploy

You need to deploy these 3 Edge Functions:

1. **retrieve-blocks** - Retrieves relevant content blocks from the database for quiz generation
2. **get-pdf-signed-url** - Generates signed URLs for PDF files in private storage
3. **generate-citation** - Generates book references/citations using AI

**Note:** `get-api-keys` is NOT needed anymore since we're using Netlify environment variables.

## Step-by-Step Deployment via Supabase Dashboard

### Function 1: retrieve-blocks

1. Go to https://supabase.com/dashboard/project/arhoasurtfurjgfohlgt
2. Click **Edge Functions** in the left sidebar
3. Click **Create a new function** (or **New Function** button)
4. Name it: `retrieve-blocks`
5. Copy the **entire contents** of `supabase/functions/retrieve-blocks/index.ts` and paste it into the editor
6. Click **Deploy** (or **Save** then **Deploy**)

### Function 2: get-pdf-signed-url

1. Still in Edge Functions, click **Create a new function** again
2. Name it: `get-pdf-signed-url`
3. Copy the **entire contents** of `supabase/functions/get-pdf-signed-url/index.ts` and paste it into the editor
4. Click **Deploy**

### Function 3: generate-citation

1. Still in Edge Functions, click **Create a new function** again
2. Name it: `generate-citation`
3. Copy the **entire contents** of `supabase/functions/generate-citation/index.ts` and paste it into the editor
4. Click **Deploy**

## Required Secrets/Environment Variables

After deploying, you need to set secrets in Supabase:

1. Go to **Settings** → **Edge Functions** → **Secrets** (or **Environment Variables**)
2. Add these secrets:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `GEMINI_API_KEY` - Your Gemini API key (for generate-citation fallback)
   - `SUPABASE_URL` - Your Supabase project URL (usually auto-set)
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (found in Settings → API)

## Verify Deployment

After deploying, you should see all 3 functions listed in the Edge Functions page. You can test them by clicking on each function and using the "Invoke" button.

## Troubleshooting

### If you don't see "Edge Functions" in the sidebar:
- Make sure you're on a Pro or Enterprise plan (Edge Functions require a paid plan)
- Or check if you need to enable Edge Functions in your project settings

### If deployment fails:
- Check that you copied the entire file contents
- Make sure there are no syntax errors
- Check the Supabase logs for error messages

### If CORS errors persist after deployment:
- Make sure you deployed the latest version with the CORS headers
- Try redeploying the function
- Clear your browser cache and try again

