import { PricingQuote } from '../types';
import { generateQuotePDF } from './pdfService';

/**
 * Send quote via email
 * Note: This requires a Supabase Edge Function or external email service
 * For now, we'll create a function that can be called from the frontend
 * and will need to be implemented with a backend service
 */
export async function sendQuoteEmail(
  quote: PricingQuote,
  recipientEmail: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // Generate PDF
    const pdfBlob = await generateQuotePDF(quote);
    
    // Convert blob to base64 for email attachment
    const pdfBase64 = await blobToBase64(pdfBlob);
    
    // For now, we'll use a simple approach with mailto link
    // In production, this should call a Supabase Edge Function or external email service
    // that handles email sending with attachments
    
    // Create email subject and body
    const subject = encodeURIComponent(`הצעת מחיר ${quote.quote_number} - RealMind`);
    const body = encodeURIComponent(`
שלום ${quote.user_name || 'לקוח'},

אנא מצורף הצעת המחיר מספר ${quote.quote_number}.

פרטי ההצעה:
- תאריך: ${new Date(quote.quote_date).toLocaleDateString('he-IL')}
${quote.valid_until ? `- תוקף עד: ${new Date(quote.valid_until).toLocaleDateString('he-IL')}` : ''}
- סה"כ: ₪${quote.total.toFixed(2)}

${quote.terms ? `תנאים:\n${quote.terms}` : ''}

${quote.notes ? `הערות:\n${quote.notes}` : ''}

בברכה,
צוות RealMind
    `);
    
    // For now, open mailto link (user can send manually)
    // In production, replace this with actual email service call
    const mailtoLink = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
    window.open(mailtoLink);
    
    // TODO: Implement actual email sending via Supabase Edge Function
    // Example:
    // const { data, error } = await supabase.functions.invoke('send-email', {
    //   body: {
    //     to: recipientEmail,
    //     subject: `הצעת מחיר ${quote.quote_number} - RealMind`,
    //     body: emailBody,
    //     attachment: pdfBase64,
    //     attachmentName: `quote-${quote.quote_number}.pdf`,
    //   },
    // });
    
    return { success: true, error: null };
  } catch (error) {
    console.error('Error sending quote email:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}

/**
 * Convert blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Send quote email via Supabase Edge Function (when implemented)
 */
export async function sendQuoteEmailViaSupabase(
  quote: PricingQuote,
  recipientEmail: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // This will be implemented when the Edge Function is created
    // For now, return an error indicating it's not implemented
    return {
      success: false,
      error: new Error('Email service not yet implemented. Please use the mailto link.'),
    };
    
    // TODO: Uncomment when Edge Function is ready
    // const { supabase } = await import('./authService');
    // const pdfBlob = generateQuotePDF(quote);
    // const pdfBase64 = await blobToBase64(pdfBlob);
    // 
    // const { data, error } = await supabase.functions.invoke('send-quote-email', {
    //   body: {
    //     to: recipientEmail,
    //     quote: quote,
    //     pdfBase64: pdfBase64,
    //   },
    // });
    // 
    // if (error) {
    //   return { success: false, error };
    // }
    // 
    // return { success: true, error: null };
  } catch (error) {
    console.error('Error sending quote email via Supabase:', error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error('Unknown error'),
    };
  }
}


