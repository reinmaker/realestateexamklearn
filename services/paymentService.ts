import { supabase } from './authService';

export interface PaymentRecord {
  email: string;
  id: string;
  user_id: string;
  stripe_payment_intent_id: string;
  stripe_customer_id: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  exam_period: string;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamPeriod {
  name: string;
  date: Date;
}

// Exam dates from ExamCountdown component
const EXAM_DATES: ExamPeriod[] = [
  {
    date: new Date('2025-11-16'),
    name: 'מועד סתיו 2025',
  },
  {
    date: new Date('2026-02-22'),
    name: 'מועד חורף 2026',
  },
  {
    date: new Date('2026-05-10'),
    name: 'מועד אביב 2026',
  },
  {
    date: new Date('2026-07-29'),
    name: 'מועד קיץ 2026',
  },
  {
    date: new Date('2026-11-15'),
    name: 'מועד סתיו 2026',
  },
];

/**
 * Get the current exam period (next upcoming exam)
 */
export function getCurrentExamPeriod(): ExamPeriod | null {
  const now = new Date();
  // Find the first exam date that is in the future
  for (const exam of EXAM_DATES) {
    if (exam.date > now) {
      return exam;
    }
  }
  return null;
}

/**
 * Get payment expiry date (same as exam date)
 */
export function getPaymentExpiryDate(examDate: Date): Date {
  return new Date(examDate);
}

/**
 * Check if a payment record is valid
 */
export function isPaymentValid(payment: PaymentRecord | null): boolean {
  if (!payment) {
    return false;
  }

  // Check status
  if (payment.status !== 'succeeded') {
    return false;
  }

  // Check expiration
  const expiresAt = new Date(payment.expires_at);
  const now = new Date();
  if (expiresAt <= now) {
    return false;
  }

  // Check exam period matches current exam period
  const currentExam = getCurrentExamPeriod();
  if (!currentExam) {
    return false;
  }
  if (payment.exam_period !== currentExam.name) {
    return false;
  }

  return true;
}

/**
 * Check if user has payment bypass (admin granted access)
 */
async function checkPaymentBypass(userId: string): Promise<boolean> {
  try {
    // Check via RPC function
    const { data: bypassData, error: bypassError } = await supabase.rpc('get_user_payment_bypass', { user_id: userId });
    if (!bypassError && bypassData === true) {
      return true;
    }
    
    // Fallback: check current user's metadata
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === userId && user?.user_metadata?.payment_bypassed === true) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Exception checking payment bypass:', error);
    return false;
  }
}

/**
 * Check if user has a valid payment
 */
export async function checkPaymentStatus(userId: string): Promise<{ hasValidPayment: boolean; payment: PaymentRecord | null; error: Error | null }> {
  try {
    // First check if user has payment bypass (admin granted access)
    const hasBypass = await checkPaymentBypass(userId);
    if (hasBypass) {
      console.log(`User ${userId} has payment bypass - granting access`);
      return { hasValidPayment: true, payment: null, error: null };
    }

    // Get user's latest payment (don't use .single() to avoid errors when no rows exist)
    const { data, error } = await supabase
      .from('user_payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking payment status:', error);
      return { hasValidPayment: false, payment: null, error: error };
    }

    // No payment found
    if (!data || data.length === 0) {
      console.log(`No payment records found for user ${userId}`);
      return { hasValidPayment: false, payment: null, error: null };
    }

    const payment = data[0] as PaymentRecord;
    console.log('Found payment record:', {
      id: payment.id,
      status: payment.status,
      exam_period: payment.exam_period,
      expires_at: payment.expires_at,
      paid_at: payment.paid_at,
    });
    
    const isValid = isPaymentValid(payment);
    console.log('Payment validation result:', {
      isValid,
      statusCheck: payment.status === 'succeeded',
      expirationCheck: new Date(payment.expires_at) > new Date(),
      examPeriodCheck: payment.exam_period === getCurrentExamPeriod()?.name,
    });

    return { hasValidPayment: isValid, payment: isValid ? payment : null, error: null };
  } catch (error) {
    console.error('Exception checking payment status:', error);
    return { hasValidPayment: false, payment: null, error: error instanceof Error ? error : new Error('Unknown error checking payment status') };
  }
}

/**
 * Get user's payment history
 */
export async function getUserPayments(userId: string): Promise<{ payments: PaymentRecord[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('user_payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { payments: [], error: error };
    }

    return { payments: (data || []) as PaymentRecord[], error: null };
  } catch (error) {
    return { payments: [], error: error instanceof Error ? error : new Error('Unknown error getting user payments') };
  }
}

/**
 * Create payment record (called from Edge Function after creating payment intent)
 */
export async function createPaymentRecord(
  userId: string,
  email: string,
  paymentIntentId: string,
  examPeriod: string,
  expiresAt: Date
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('user_payments')
      .insert({
        user_id: userId,
        email: email,
        stripe_payment_intent_id: paymentIntentId,
        amount: 16900, // 169 NIS in agorot
        currency: 'ils',
        status: 'pending',
        exam_period: examPeriod,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      return { error: error };
    }

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unknown error creating payment record') };
  }
}

/**
 * Update payment status (called from webhook)
 */
export async function updatePaymentStatus(
  paymentIntentId: string,
  status: 'pending' | 'succeeded' | 'failed' | 'canceled',
  paidAt?: Date
): Promise<{ error: Error | null }> {
  try {
    const updateData: any = {
      status: status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'succeeded' && paidAt) {
      updateData.paid_at = paidAt.toISOString();
    }

    const { error } = await supabase
      .from('user_payments')
      .update(updateData)
      .eq('stripe_payment_intent_id', paymentIntentId);

    if (error) {
      return { error: error };
    }

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unknown error updating payment status') };
  }
}

