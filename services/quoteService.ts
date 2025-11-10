import { supabase } from './authService';
import { PricingQuote, QuoteLineItem } from '../types';

/**
 * Calculate totals from line items and tax rate
 */
export function calculateTotals(lineItems: QuoteLineItem[], taxRate: number): {
  subtotal: number;
  taxAmount: number;
  total: number;
} {
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Generate a unique quote number
 */
export async function generateQuoteNumber(): Promise<string> {
  try {
    // Use the database function to generate quote number
    const { data, error } = await supabase.rpc('generate_quote_number');
    
    if (error) {
      console.error('Error generating quote number:', error);
      // Fallback: generate manually
      const year = new Date().getFullYear();
      const { data: latestQuote } = await supabase
        .from('pricing_quotes')
        .select('quote_number')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      let sequenceNum = 1;
      if (latestQuote && latestQuote.quote_number) {
        const match = latestQuote.quote_number.match(new RegExp(`Q-${year}-(\\d+)`));
        if (match) {
          sequenceNum = parseInt(match[1], 10) + 1;
        }
      }
      return `Q-${year}-${String(sequenceNum).padStart(3, '0')}`;
    }
    
    return data || `Q-${new Date().getFullYear()}-001`;
  } catch (error) {
    console.error('Error in generateQuoteNumber:', error);
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `Q-${year}-${timestamp}`;
  }
}

/**
 * Create a new pricing quote
 */
export async function createQuote(
  userId: string | null,
  quoteData: {
    user_id?: string | null;
    user_name?: string | null;
    user_email?: string | null;
    quote_date: string;
    valid_until?: string | null;
    line_items: QuoteLineItem[];
    tax_rate: number;
    terms?: string | null;
    notes?: string | null;
    status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
    show_price_summary?: boolean;
  },
  createdBy: string
): Promise<{ quote: PricingQuote | null; error: Error | null }> {
  try {
    // Calculate totals
    const { subtotal, taxAmount, total } = calculateTotals(quoteData.line_items, quoteData.tax_rate);
    
    // Generate quote number
    const quoteNumber = await generateQuoteNumber();
    
    // Get user details if user_id is provided
    let userName = quoteData.user_name || null;
    let userEmail = quoteData.user_email || null;
    
    if (quoteData.user_id && !userName) {
      const { data: userData } = await supabase.rpc('get_user_details', { user_id: quoteData.user_id });
      if (userData && userData.length > 0) {
        userName = userData[0].name;
        userEmail = userData[0].email;
      }
    }
    
    const { data, error } = await supabase
      .from('pricing_quotes')
      .insert([
        {
          quote_number: quoteNumber,
          user_id: quoteData.user_id || null,
          user_name: userName,
          user_email: userEmail,
          quote_date: quoteData.quote_date,
          valid_until: quoteData.valid_until || null,
          line_items: quoteData.line_items,
          subtotal,
          tax_rate: quoteData.tax_rate,
          tax_amount: taxAmount,
          total,
          terms: quoteData.terms || null,
          notes: quoteData.notes || null,
          status: quoteData.status || 'draft',
          show_price_summary: quoteData.show_price_summary !== false, // Default to true if not specified
          created_by: createdBy,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating quote:', error);
      return { quote: null, error: error as Error };
    }

    return { quote: data as PricingQuote, error: null };
  } catch (error) {
    console.error('Error in createQuote:', error);
    return { quote: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Get all quotes (admin only)
 */
export async function getAllQuotes(): Promise<{ quotes: PricingQuote[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('pricing_quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching quotes:', error);
      return { quotes: [], error: error as Error };
    }

    return { quotes: (data || []) as PricingQuote[], error: null };
  } catch (error) {
    console.error('Error in getAllQuotes:', error);
    return { quotes: [], error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Get quote by ID
 */
export async function getQuoteById(quoteId: string): Promise<{ quote: PricingQuote | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('pricing_quotes')
      .select('*')
      .eq('id', quoteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { quote: null, error: null };
      }
      console.error('Error fetching quote:', error);
      return { quote: null, error: error as Error };
    }

    return { quote: data as PricingQuote, error: null };
  } catch (error) {
    console.error('Error in getQuoteById:', error);
    return { quote: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Get quotes by user ID
 */
export async function getQuotesByUser(userId: string): Promise<{ quotes: PricingQuote[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('pricing_quotes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user quotes:', error);
      return { quotes: [], error: error as Error };
    }

    return { quotes: (data || []) as PricingQuote[], error: null };
  } catch (error) {
    console.error('Error in getQuotesByUser:', error);
    return { quotes: [], error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Update a quote
 */
export async function updateQuote(
  quoteId: string,
  updates: {
    user_id?: string | null;
    user_name?: string | null;
    user_email?: string | null;
    quote_date?: string;
    valid_until?: string | null;
    line_items?: QuoteLineItem[];
    tax_rate?: number;
    terms?: string | null;
    notes?: string | null;
    status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
    show_price_summary?: boolean;
  }
): Promise<{ quote: PricingQuote | null; error: Error | null }> {
  try {
    // Get current quote to merge updates
    const { quote: currentQuote } = await getQuoteById(quoteId);
    if (!currentQuote) {
      return { quote: null, error: new Error('Quote not found') };
    }

    // Merge updates
    const mergedData = {
      ...currentQuote,
      ...updates,
    };

    // Recalculate totals if line_items or tax_rate changed
    let subtotal = mergedData.subtotal;
    let taxAmount = mergedData.tax_amount;
    let total = mergedData.total;

    if (updates.line_items || updates.tax_rate !== undefined) {
      const lineItems = updates.line_items || currentQuote.line_items;
      const taxRate = updates.tax_rate !== undefined ? updates.tax_rate : currentQuote.tax_rate;
      const calculated = calculateTotals(lineItems, taxRate);
      subtotal = calculated.subtotal;
      taxAmount = calculated.taxAmount;
      total = calculated.total;
    }

    // Get user details if user_id is provided and changed
    let userName = mergedData.user_name;
    let userEmail = mergedData.user_email;

    if (updates.user_id && updates.user_id !== currentQuote.user_id) {
      const { data: userData } = await supabase.rpc('get_user_details', { user_id: updates.user_id });
      if (userData && userData.length > 0) {
        userName = userData[0].name;
        userEmail = userData[0].email;
      }
    }

    const { data, error } = await supabase
      .from('pricing_quotes')
      .update({
        user_id: mergedData.user_id,
        user_name: userName,
        user_email: userEmail,
        quote_date: mergedData.quote_date,
        valid_until: mergedData.valid_until,
        line_items: mergedData.line_items,
        subtotal,
        tax_rate: mergedData.tax_rate,
        tax_amount: taxAmount,
        total,
        terms: mergedData.terms,
        notes: mergedData.notes,
        status: mergedData.status,
        show_price_summary: updates.show_price_summary !== undefined ? updates.show_price_summary : (currentQuote as any).show_price_summary !== false,
      })
      .eq('id', quoteId)
      .select()
      .single();

    if (error) {
      console.error('Error updating quote:', error);
      return { quote: null, error: error as Error };
    }

    return { quote: data as PricingQuote, error: null };
  } catch (error) {
    console.error('Error in updateQuote:', error);
    return { quote: null, error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

/**
 * Delete a quote
 */
export async function deleteQuote(quoteId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('pricing_quotes')
      .delete()
      .eq('id', quoteId);

    if (error) {
      console.error('Error deleting quote:', error);
      return { error: error as Error };
    }

    return { error: null };
  } catch (error) {
    console.error('Error in deleteQuote:', error);
    return { error: error instanceof Error ? error : new Error('Unknown error') };
  }
}

