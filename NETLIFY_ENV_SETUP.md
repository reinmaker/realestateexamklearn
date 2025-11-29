# Netlify Environment Variables Setup Guide

## Required Environment Variables

For this Vite application to work correctly, you need to set the following environment variables in Netlify:

### Required Variables:
- `VITE_OPENAI_API_KEY` - Your OpenAI API key
- `VITE_GEMINI_API_KEY` - Your Gemini API key
- `VITE_GOOGLE_CLOUD_TTS_API_KEY` - Your Google Cloud TTS API key (optional)
- `VITE_STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key (starts with `pk_`) for payment processing

## How to Set Environment Variables in Netlify

### Option 1: Via Netlify UI (Recommended)

1. Go to your Netlify dashboard: https://app.netlify.com
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**
5. For each variable:
   - **Key**: `VITE_OPENAI_API_KEY` (or `VITE_GEMINI_API_KEY`, etc.)
   - **Value**: Your actual API key
   - **Scopes**: Leave as "All scopes" (or select "Builds" if you want to limit it)
   - **Deploy contexts**: Leave as "All deploy contexts" (or set specific contexts if needed)
6. Click **Save**
7. Repeat for all required variables

### Option 2: Via Netlify CLI

```bash
# Install Netlify CLI if not already installed
npm install -g netlify-cli

# Login to Netlify
netlify login

# Link to your site (if not already linked)
netlify link

# Set environment variables
netlify env:set VITE_OPENAI_API_KEY "your-openai-key"
netlify env:set VITE_GEMINI_API_KEY "your-gemini-key"
netlify env:set VITE_GOOGLE_CLOUD_TTS_API_KEY "your-tts-key"
netlify env:set VITE_STRIPE_PUBLISHABLE_KEY "pk_live_..." # Use pk_live_ for production, pk_test_ for testing
```

## Important Notes

### 1. VITE_ Prefix is Required
- In Vite, environment variables **must** be prefixed with `VITE_` to be exposed to client-side code
- Variables without the `VITE_` prefix will NOT be accessible in the browser
- The code checks for both `VITE_OPENAI_API_KEY` and `OPENAI_API_KEY` for compatibility, but `VITE_` prefix is preferred

### 2. Build Time vs Runtime
- Environment variables are embedded **at build time** in Vite
- If you set variables after a build, you **must trigger a new build** for them to be available
- To trigger a new build:
  1. Go to **Deploys** in Netlify dashboard
  2. Click **Trigger deploy** → **Deploy site**

### 3. Scope Settings
- For this application, variables should be available to **Builds** scope (default is "All scopes")
- This ensures they're available during the build process where Vite embeds them

### 4. Deploy Contexts
- By default, variables are available to all deploy contexts (Production, Deploy Previews, Branch deploys, etc.)
- You can set different values for different contexts if needed
- For example, you might want different API keys for production vs previews

## Verification

After setting the variables and triggering a new build:

1. Check the build logs to ensure the build completed successfully
2. Open your deployed site
3. Check the browser console - you should NOT see errors like:
   - "OPENAI_API_KEY is not configured in environment variables"
   - "GEMINI_API_KEY is not configured in environment variables"
4. Try using features that require API keys (e.g., generating a quiz)

## Troubleshooting

### Variables Not Working After Setting Them

1. **Check the variable names**: Make sure they start with `VITE_`
2. **Trigger a new build**: Environment variables are embedded at build time
3. **Check the scope**: Variables should be available to "Builds" scope
4. **Check deploy context**: Make sure variables are set for the correct deploy context (Production, etc.)

### Variables Work Locally But Not in Production

- Local development uses `.env.local` file
- Production uses Netlify environment variables
- Make sure variables are set in Netlify, not just locally

### Still Getting "API_KEY is not configured" Errors

1. Verify variables are set in Netlify dashboard
2. Check that variable names match exactly (case-sensitive)
3. Trigger a new build after setting variables
4. Check build logs for any errors during the build process

## Security Best Practices

1. **Mark as Secret**: In Netlify UI, you can mark variables as "Contains secret values" for additional security
2. **Use Scopes**: Limit variables to only the scopes that need them (e.g., "Builds" only)
3. **Use Deploy Contexts**: Set different values for production vs previews if needed
4. **Never commit secrets**: Don't commit API keys to your repository

## Additional Resources

- [Netlify Environment Variables Documentation](https://docs.netlify.com/environment-variables/overview/)
- [Vite Environment Variables Documentation](https://vitejs.dev/guide/env-and-mode.html)

