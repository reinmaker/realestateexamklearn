# Stripe Payment Production Setup Guide

This guide explains how to configure Stripe payments for production deployment.

## Overview

The payment system uses Stripe Checkout (hosted payment page) and requires configuration in both:
1. **Netlify** (frontend environment variables)
2. **Supabase** (backend Edge Functions secrets)
3. **Stripe Dashboard** (webhook configuration)

## Step 1: Netlify Environment Variables

Add the following environment variable in Netlify:

### Required:
- **`VITE_STRIPE_PUBLISHABLE_KEY`** - Your Stripe publishable key
  - For production: Use your **live** publishable key (starts with `pk_live_`)
  - For testing: Use your **test** publishable key (starts with `pk_test_`)
  - Find it in: Stripe Dashboard → Developers → API keys → Publishable key

### How to Set:
1. Go to Netlify Dashboard → Your Site → Site settings → Environment variables
2. Click "Add a variable"
3. Key: `VITE_STRIPE_PUBLISHABLE_KEY`
4. Value: Your Stripe publishable key (e.g., `pk_live_...`)
5. Scopes: All scopes
6. Deploy contexts: All deploy contexts
7. Click "Save"
8. **Trigger a new build** for the variable to take effect

## Step 2: Supabase Edge Function Secrets

Add the following secrets in Supabase for your Edge Functions:

### Required Secrets:
- **`STRIPE_SECRET`** - Your Stripe secret key
  - For production: Use your **live** secret key (starts with `sk_live_`)
  - For testing: Use your **test** secret key (starts with `sk_test_`)
  - Find it in: Stripe Dashboard → Developers → API keys → Secret key
  - ⚠️ **NEVER** expose this key in client-side code!

- **`SIGNING_SECRET`** - Your Stripe webhook signing secret
  - This is specific to each webhook endpoint
  - Find it in: Stripe Dashboard → Developers → Webhooks → Your webhook → Signing secret
  - Format: `whsec_...`

### How to Set (via Supabase CLI):

```bash
# Make sure you're logged in and linked to your project
supabase login
supabase link --project-ref your-project-ref

# Set Stripe secret key
supabase secrets set STRIPE_SECRET=sk_live_...

# Set webhook signing secret
supabase secrets set SIGNING_SECRET=whsec_...
```

### How to Set (via Supabase Dashboard):

1. Go to Supabase Dashboard → Your Project → Settings → Edge Functions → Secrets
2. Click "Add new secret"
3. For each secret:
   - **Name**: `STRIPE_SECRET` (or `SIGNING_SECRET`)
   - **Value**: Your secret value
4. Click "Save"
5. Secrets are automatically available to all Edge Functions

## Step 3: Stripe Webhook Configuration

Configure the webhook endpoint in Stripe Dashboard:

### Webhook URL:
```
https://[your-project-ref].supabase.co/functions/v1/stripe-webhook
```

Replace `[your-project-ref]` with your actual Supabase project reference.

### Steps:
1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint" (or edit existing endpoint)
3. **Endpoint URL**: `https://[your-project-ref].supabase.co/functions/v1/stripe-webhook`
4. **Description**: "Supabase Payment Webhook"
5. **Events to send**: Select these events:
   - `checkout.session.completed` ✅ (Required)
   - `payment_intent.succeeded` ✅ (Optional, for additional verification)
   - `payment_intent.payment_failed` ✅ (Optional, for error handling)
   - `payment_intent.canceled` ✅ (Optional, for error handling)
6. Click "Add endpoint"
7. **Copy the Signing secret** (`whsec_...`) and add it to Supabase secrets as `SIGNING_SECRET`

## Step 4: Verify Configuration

### Test the Payment Flow:

1. **Frontend Check**:
   - Open your production site
   - Try to make a payment
   - You should be redirected to Stripe Checkout
   - After payment, you should be redirected back to your site with `?payment=success`

2. **Webhook Check**:
   - Go to Stripe Dashboard → Developers → Webhooks
   - Click on your webhook endpoint
   - Check "Recent events" - you should see `checkout.session.completed` events
   - If events show errors, check Supabase Edge Function logs

3. **Database Check**:
   - Go to Supabase Dashboard → Table Editor → `user_payments`
   - After a successful payment, you should see a new record with `status = 'succeeded'`

## Troubleshooting

### Payment redirects to localhost
- **Issue**: The `origin` header is missing from the request
- **Solution**: Ensure your frontend is making requests with proper headers. The Edge Function requires an `origin` header.

### Webhook signature verification fails
- **Issue**: `SIGNING_SECRET` in Supabase doesn't match the webhook signing secret in Stripe
- **Solution**: 
  1. Go to Stripe Dashboard → Webhooks → Your webhook → Signing secret
  2. Copy the secret (starts with `whsec_`)
  3. Update Supabase secret: `supabase secrets set SIGNING_SECRET=whsec_...`

### Payment succeeds but status stays "pending"
- **Issue**: Webhook not firing or failing
- **Solution**:
  1. Check Stripe Dashboard → Webhooks → Recent events for errors
  2. Check Supabase Dashboard → Edge Functions → Logs for `stripe-webhook` function
  3. Verify webhook URL is correct and accessible
  4. Verify `SIGNING_SECRET` is set correctly

### Environment variables not working
- **Issue**: Variables set but not accessible
- **Solution**:
  - For Netlify: Variables must be prefixed with `VITE_` and you must trigger a new build
  - For Supabase: Secrets are automatically available to Edge Functions, no prefix needed

## Production Checklist

- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` set in Netlify (use `pk_live_` for production)
- [ ] `STRIPE_SECRET` set in Supabase secrets (use `sk_live_` for production)
- [ ] `SIGNING_SECRET` set in Supabase secrets (from Stripe webhook)
- [ ] Webhook endpoint configured in Stripe Dashboard
- [ ] Webhook URL points to: `https://[project-ref].supabase.co/functions/v1/stripe-webhook`
- [ ] Webhook events selected: `checkout.session.completed` (and optionally others)
- [ ] Test payment completed successfully
- [ ] Payment record created in `user_payments` table with `status = 'succeeded'`
- [ ] User redirected back to site after payment

## Security Notes

1. **Never commit secrets to git** - Use environment variables/secrets management
2. **Use live keys only in production** - Use test keys (`pk_test_`, `sk_test_`) for development
3. **Webhook signing secret is critical** - It verifies that webhooks are actually from Stripe
4. **Secret keys are server-side only** - Never expose `sk_` keys in client-side code
5. **Publishable keys are safe** - `pk_` keys can be used in client-side code

## Support

If you encounter issues:
1. Check Supabase Edge Function logs: Dashboard → Edge Functions → Logs
2. Check Stripe Dashboard → Webhooks → Recent events
3. Check browser console for client-side errors
4. Verify all environment variables are set correctly

