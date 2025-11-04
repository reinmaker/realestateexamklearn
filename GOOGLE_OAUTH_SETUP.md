# Google OAuth Setup Guide

## Problem
If you see the error: "Unable to exchange external code" when trying to sign in with Google, it means Google OAuth is not properly configured in Supabase.

## Solution

### Step 1: Configure Google OAuth in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Choose **Web application**
6. Add authorized redirect URIs:
   - `https://arhoasurtfurjgfohlgt.supabase.co/auth/v1/callback`
   - `http://localhost:3000/auth/v1/callback` (for local development)
7. Copy the **Client ID** and **Client Secret**

### Step 2: Configure in Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `arhoasurtfurjgfohlgt`
3. Go to **Authentication** → **Providers**
4. Find **Google** provider
5. Click **Enable**
6. Enter:
   - **Client ID** (from Google Cloud Console)
   - **Client Secret** (from Google Cloud Console)
7. Click **Save**

### Step 3: Verify Redirect URI

Make sure the redirect URI in Google Cloud Console matches:
- Production: `https://arhoasurtfurjgfohlgt.supabase.co/auth/v1/callback`
- Local: `http://localhost:3000/auth/v1/callback`

### Common Issues

1. **"Unable to exchange external code"**
   - Check that Client ID and Client Secret are correct
   - Verify redirect URI matches exactly
   - Make sure Google OAuth is enabled in Supabase

2. **"Redirect URI mismatch"**
   - Ensure the redirect URI in Google Cloud Console matches Supabase's callback URL
   - Check for trailing slashes or extra characters

3. **"OAuth consent screen not configured"**
   - Go to Google Cloud Console → **APIs & Services** → **OAuth consent screen**
   - Complete the consent screen setup
   - Add your email as a test user if in testing mode

## Note
Google OAuth users are automatically confirmed (email_confirmed is true), so they don't need to confirm their email separately.

