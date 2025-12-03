import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Initialize Stripe with publishable key
 */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      // Don't log error in production - just return null gracefully
      if (import.meta.env.DEV) {
        console.warn('VITE_STRIPE_PUBLISHABLE_KEY is not set. Payment functionality will be disabled.');
      }
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

/**
 * Create Stripe Checkout Session via Supabase Edge Function
 */
export async function createCheckoutSession(
  amount: number,
  currency: string,
  userId: string,
  email: string,
  examPeriod: string
): Promise<{ checkoutUrl: string | null; sessionId: string | null; error: Error | null }> {
  try {
    const { supabase } = await import('./authService');
    
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: {
        amount,
        currency,
        userId,
        email,
        examPeriod,
      },
    });

    if (error) {
      console.error('Supabase function error:', error);
      return { checkoutUrl: null, sessionId: null, error: error };
    }

    if (!data) {
      return { checkoutUrl: null, sessionId: null, error: new Error('No data returned from checkout session creation') };
    }

    if (data.error) {
      return { checkoutUrl: null, sessionId: null, error: new Error(data.error) };
    }

    if (!data.checkoutUrl || !data.sessionId) {
      console.error('Invalid response format:', data);
      return { checkoutUrl: null, sessionId: null, error: new Error(`Invalid response from checkout session creation. Got: ${JSON.stringify(data)}`) };
    }

    return { checkoutUrl: data.checkoutUrl, sessionId: data.sessionId, error: null };
  } catch (error) {
    console.error('Exception creating checkout session:', error);
    return { checkoutUrl: null, sessionId: null, error: error instanceof Error ? error : new Error('Unknown error creating checkout session') };
  }
}

/**
 * @deprecated Use createCheckoutSession instead
 * Create payment intent via Supabase Edge Function (kept for backward compatibility)
 */
export async function createPaymentIntent(
  amount: number,
  currency: string,
  userId: string,
  email: string,
  examPeriod: string
): Promise<{ clientSecret: string | null; paymentIntentId: string | null; error: Error | null }> {
  const { checkoutUrl, sessionId, error } = await createCheckoutSession(amount, currency, userId, email, examPeriod);
  return { clientSecret: checkoutUrl, paymentIntentId: sessionId, error };
}

/**
 * Confirm payment with Stripe
 */
export async function confirmPayment(
  clientSecret: string,
  paymentMethod: any
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { success: false, error: new Error('Stripe not initialized') };
    }

    const { error } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: paymentMethod,
    });

    if (error) {
      return { success: false, error: error };
    }

    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error('Unknown error confirming payment') };
  }
}

/**
 * Get payment status from Stripe (for polling)
 */
export async function getPaymentStatus(paymentIntentId: string): Promise<{ status: string | null; error: Error | null }> {
  try {
    const { supabase } = await import('./authService');
    
    const { data, error } = await supabase.functions.invoke('get-payment-status', {
      body: { paymentIntentId },
    });

    if (error) {
      return { status: null, error: error };
    }

    return { status: data?.status || null, error: null };
  } catch (error) {
    return { status: null, error: error instanceof Error ? error : new Error('Unknown error getting payment status') };
  }
}

