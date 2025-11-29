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

  console.log('Webhook received:', {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
  });

  try {
    // Get Stripe secret key and webhook secret from environment
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET');
    const webhookSecret = Deno.env.get('SIGNING_SECRET');
    
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET is not set');
      throw new Error('STRIPE_SECRET is not set');
    }
    if (!webhookSecret) {
      console.error('SIGNING_SECRET is not set');
      throw new Error('SIGNING_SECRET is not set');
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the raw body FIRST (can only be read once)
    const body = await req.text();
    console.log('Webhook body length:', body.length);
    
    // Get the signature from headers (Stripe sends it as 'stripe-signature')
    const signature = req.headers.get('stripe-signature');
    
    console.log('Webhook headers:', {
      hasSignature: !!signature,
      signaturePreview: signature ? signature.substring(0, 50) + '...' : null,
    });
    
    if (!signature) {
      // Log all headers to debug
      const allHeaders: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        allHeaders[key] = value;
      });
      console.error('Missing stripe-signature header. All headers:', allHeaders);
      
      // Check if this is accidentally calling the wrong endpoint
      try {
        const bodyJson = JSON.parse(body);
        // If it looks like create-payment-intent request format, give helpful error
        if (bodyJson.amount !== undefined || bodyJson.userId !== undefined) {
          return new Response(
            JSON.stringify({ 
              error: 'Wrong endpoint! This is the webhook endpoint. Stripe webhooks should send event objects, not payment intent data. Make sure your Stripe webhook URL points to: /functions/v1/stripe-webhook' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) {
        // Not JSON, continue with normal error
      }
      return new Response(
        JSON.stringify({ error: 'No signature found. This endpoint requires Stripe webhook signature header. Make sure your Stripe webhook is configured correctly.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify webhook signature (use async version for Deno/Edge Functions)
    let event;
    try {
      console.log('Attempting to verify webhook signature...', {
        bodyLength: body.length,
        signatureLength: signature.length,
        hasWebhookSecret: !!webhookSecret,
      });
      // Use constructEventAsync for Deno/Edge Functions environment
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      console.log('Webhook event verified successfully:', event.type, event.id);
    } catch (err) {
      console.error('Webhook signature verification failed:', {
        error: err.message,
        errorType: err.constructor.name,
        signature: signature.substring(0, 50) + '...',
        webhookSecretLength: webhookSecret?.length || 0,
      });
      return new Response(
        JSON.stringify({ 
          error: 'Webhook signature verification failed', 
          details: err.message,
          hint: 'Check that SIGNING_SECRET in Supabase secrets matches the webhook signing secret from Stripe Dashboard'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log('Processing checkout.session.completed event:', {
        sessionId: session.id,
        paymentIntentId: session.payment_intent,
        customerEmail: session.customer_email,
        metadata: session.metadata,
      });
      
      // Get payment intent ID from session
      const paymentIntentId = session.payment_intent as string;
      const userId = session.metadata?.userId;
      
      // First, try to find the payment record by session ID (stored initially)
      const { data: existingPayment, error: findError } = await supabase
        .from('user_payments')
        .select('*')
        .eq('stripe_payment_intent_id', session.id)
        .limit(1);
      
      console.log('Found payment record by session ID:', { existingPayment, findError });
      
      if (findError || !existingPayment || existingPayment.length === 0) {
        console.log('Payment record not found by session ID, trying user_id lookup...');
        // If not found by session ID, try to find by user_id and metadata
        if (userId) {
          const { data: userPayment, error: userFindError } = await supabase
            .from('user_payments')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);
          
          console.log('Found payment record by user_id:', { userPayment, userFindError });
          
          if (userPayment && userPayment.length > 0) {
            // Update the found payment record
            const { error: updateError } = await supabase
              .from('user_payments')
              .update({
                status: 'succeeded',
                stripe_payment_intent_id: paymentIntentId || session.id,
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', userPayment[0].id);
            
            if (updateError) {
              console.error('Error updating payment record by user_id:', updateError);
              return new Response(
                JSON.stringify({ error: 'Failed to update payment record', details: updateError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            } else {
              console.log('Successfully updated payment record:', userPayment[0].id);
            }
          } else {
            console.warn('No pending payment found for user_id:', userId);
            // Try to create a new payment record if none exists
            if (session.metadata?.examPeriod && session.customer_email) {
              console.log('Attempting to create payment record from webhook data...');
              const examDates: { [key: string]: string } = {
                'מועד סתיו 2025': '2025-11-16',
                'מועד חורף 2026': '2026-02-22',
                'מועד אביב 2026': '2026-05-10',
                'מועד קיץ 2026': '2026-07-29',
                'מועד סתיו 2026': '2026-11-15',
              };
              const examDate = examDates[session.metadata.examPeriod];
              if (examDate) {
                const expiresAt = new Date(examDate);
                const { error: createError } = await supabase
                  .from('user_payments')
                  .insert({
                    user_id: userId,
                    email: session.customer_email,
                    stripe_payment_intent_id: paymentIntentId || session.id,
                    amount: session.amount_total || 16900,
                    currency: session.currency || 'ils',
                    status: 'succeeded',
                    exam_period: session.metadata.examPeriod,
                    expires_at: expiresAt.toISOString(),
                    paid_at: new Date().toISOString(),
                  });
                
                if (createError) {
                  console.error('Error creating payment record from webhook:', createError);
                } else {
                  console.log('Successfully created payment record from webhook');
                }
              }
            }
          }
        } else {
          console.error('No userId found in session metadata');
        }
      } else {
        // Update payment record using session ID
        const { error: updateError } = await supabase
          .from('user_payments')
          .update({
            status: 'succeeded',
            stripe_payment_intent_id: paymentIntentId || session.id, // Update with actual payment intent ID
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', session.id);
        
        if (updateError) {
          console.error('Error updating payment record:', updateError);
          // Try updating by payment intent ID if session ID didn't match
          if (paymentIntentId) {
            const { error: retryError } = await supabase
              .from('user_payments')
              .update({
                status: 'succeeded',
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('stripe_payment_intent_id', paymentIntentId);
            
            if (retryError) {
              console.error('Error updating payment record by payment intent:', retryError);
            } else {
              console.log('Successfully updated payment record by payment intent ID');
            }
          }
        } else {
          console.log('Successfully updated payment record by session ID');
        }
      }
    } else if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      // Update payment record
      const { error } = await supabase
        .from('user_payments')
        .update({
          status: 'succeeded',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (error) {
        console.error('Error updating payment record:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update payment record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Payment succeeded:', paymentIntent.id);
    } else if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      // Update payment record
      const { error } = await supabase
        .from('user_payments')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (error) {
        console.error('Error updating payment record:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update payment record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Payment failed:', paymentIntent.id);
    } else if (event.type === 'payment_intent.canceled') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      // Update payment record
      const { error } = await supabase
        .from('user_payments')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (error) {
        console.error('Error updating payment record:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update payment record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Payment canceled:', paymentIntent.id);
    }

    // Return a response to acknowledge receipt of the event
    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

