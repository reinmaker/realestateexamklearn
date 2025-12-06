import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Stripe secret key from environment
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET is not set');
    }

    // Debug: Log which mode Stripe is using (test vs live)
    const isLiveMode = stripeSecretKey.startsWith('sk_live_');
    console.log(`[DEBUG] Stripe mode: ${isLiveMode ? 'LIVE (Production)' : 'TEST (Sandbox)'}, Key prefix: ${stripeSecretKey.substring(0, 7)}...`);

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
      // Use Deno-compatible fetch
      fetch: fetch,
    });

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get request body
    const { amount, currency, userId, email, examPeriod } = await req.json();

    if (!amount || !currency || !userId || !email || !examPeriod) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate expiry date (exam date)
    const examDates: { [key: string]: string } = {
      'מועד סתיו 2025': '2025-11-16',
      'מועד חורף 2026': '2026-02-22',
      'מועד אביב 2026': '2026-05-10',
      'מועד קיץ 2026': '2026-07-29',
      'מועד סתיו 2026': '2026-11-15',
    };

    const examDate = examDates[examPeriod];
    if (!examDate) {
      return new Response(
        JSON.stringify({ error: 'Invalid exam period' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAt = new Date(examDate);

    // Get the origin from request headers
    // In production, this should be set by the client (Netlify URL)
    // Try referer header as fallback for better compatibility
    let origin = req.headers.get('origin');
    
    if (!origin) {
      // Fallback to referer header if origin is not available
      const referer = req.headers.get('referer');
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          origin = `${refererUrl.protocol}//${refererUrl.host}`;
        } catch (e) {
          console.error('Failed to parse referer URL:', e);
        }
      }
    }
    
    // If still no origin, return error (better than using localhost in production)
    if (!origin) {
      console.error('No origin or referer header found in request');
      return new Response(
        JSON.stringify({ error: 'Missing origin header. Please ensure the request includes an origin header.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const successUrl = `${origin}/?payment=success`;
    const cancelUrl = `${origin}/?payment=canceled`;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(), // 'ils' for Israeli Shekel
            product_data: {
              name: `גישה לפלטפורמה - ${examPeriod}`,
              description: `תשלום עבור גישה לפלטפורמה עד ${examPeriod}`,
            },
            unit_amount: amount, // Amount in agorot (16900 for 169 NIS)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      metadata: {
        userId,
        email,
        examPeriod,
      },
    });

    if (!session.url) {
      throw new Error('Failed to create Stripe Checkout Session URL');
    }

    // Create payment record in database using session ID
    const { error: dbError } = await supabase
      .from('user_payments')
      .insert({
        user_id: userId,
        email: email,
        stripe_payment_intent_id: session.id, // Store session ID initially
        amount: amount,
        currency: currency.toLowerCase(),
        status: 'pending',
        exam_period: examPeriod,
        expires_at: expiresAt.toISOString(),
      });

    if (dbError) {
      console.error('Error creating payment record:', dbError);
      // Still return checkout session, but log the error
    }

    return new Response(
      JSON.stringify({
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

