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
3. Go to **Authentication** → **URL Configuration**
4. Under **Redirect URLs**, add:
   - `http://localhost:3000/` (for local development)
   - `https://realmind.netlify.app/` (for production)
   - Make sure both URLs end with `/` and are added to the allowlist
5. Go to **Authentication** → **Providers**
6. Find **Google** provider
7. Click **Enable**
8. Enter:
   - **Client ID** (from Google Cloud Console)
   - **Client Secret** (from Google Cloud Console)
9. Click **Save**

### Step 3: Verify Redirect URI

Make sure the redirect URI in Google Cloud Console matches:
- Production: `https://arhoasurtfurjgfohlgt.supabase.co/auth/v1/callback`
- Local: `http://localhost:3000/auth/v1/callback` (only needed if testing OAuth locally)

### Step 4: Verify Site URL in Supabase

1. Go to **Authentication** → **URL Configuration**
2. Check the **Site URL** setting
3. For production, it should be: `https://realmind.netlify.app/`
4. For local development, it can be: `http://localhost:3000/`
5. **Important**: The `redirectTo` in your code must match one of the URLs in the **Redirect URLs** allowlist

### Common Issues

1. **"Unable to exchange external code" (CRITICAL - This is the error you're seeing)**
   
   This error means Supabase cannot exchange the authorization code from Google for tokens. This happens when:
   
   **Fix Steps:**
   
   a. **Verify Client ID and Secret in Supabase:**
      - Go to Supabase Dashboard → Authentication → Providers → Google
      - Click **Edit** or **Configure**
      - **Delete** the existing Client ID and Client Secret
      - **Re-enter** them exactly from Google Cloud Console
      - Make sure there are no extra spaces, line breaks, or hidden characters
      - Click **Save**
      - **Wait 1-2 minutes** for changes to propagate
   
   b. **Verify Redirect URI in Google Cloud Console:**
      - Go to Google Cloud Console → APIs & Services → Credentials
      - Click on your OAuth 2.0 Client ID
      - Under **Authorized redirect URIs**, verify this exact URL is listed:
        - `https://arhoasurtfurjgfohlgt.supabase.co/auth/v1/callback`
      - **Important:** 
        - Must be exactly `https://` (not `http://`)
        - Must end with `/auth/v1/callback` (no trailing slash after callback)
        - Must match your Supabase project URL exactly
      - If not present, add it and click **Save**
   
   c. **Verify OAuth Consent Screen:**
      - Go to Google Cloud Console → APIs & Services → OAuth consent screen
      - Make sure it's configured (at minimum, app name and user support email)
      - If in testing mode, add your email as a test user
      - Publish the app if ready (or keep in testing mode with test users)
   
   d. **Double-check the callback URL format:**
      - The callback URL must be: `https://{your-project-ref}.supabase.co/auth/v1/callback`
      - Your project ref is: `arhoasurtfurjgfohlgt`
      - So the URL is: `https://arhoasurtfurjgfohlgt.supabase.co/auth/v1/callback`
      - This must match **exactly** in Google Cloud Console

2. **"Redirect URI mismatch"**
   - Ensure the redirect URI in Google Cloud Console matches Supabase's callback URL exactly
   - Check for trailing slashes or extra characters
   - The callback URL is: `https://arhoasurtfurjgfohlgt.supabase.co/auth/v1/callback` (no trailing slash)

3. **"OAuth consent screen not configured"**
   - Go to Google Cloud Console → **APIs & Services** → **OAuth consent screen**
   - Complete the consent screen setup (at minimum: App name, User support email)
   - Add your email as a test user if in testing mode
   - Save and publish (or keep in testing mode)

## Note
Google OAuth users are automatically confirmed (email_confirmed is true), so they don't need to confirm their email separately.

