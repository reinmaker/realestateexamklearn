import { PricingQuote } from '../types';
// @ts-ignore
import html2canvas from 'html2canvas';
// @ts-ignore
import jsPDF from 'jspdf';

/**
 * Get logo URL - can be a local file path, URL, or base64 data URL
 * Replace this with your actual logo path or URL
 */
function getLogoUrl(): string {
  // Option 1: Use a local file path (relative to public folder or root)
  // return '/logo.png';
  
  // Option 2: Use a base64 encoded image
  // return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';
  
  // Option 3: Use an external URL
  // return 'https://example.com/logo.png';
  
  // For now, return empty string (logo will be hidden if not found)
  // You can replace this with your actual logo path
  return '/logo.png'; // Default path - replace with your logo location
}

/**
 * Generate HTML content for the quote
 */
function generateQuoteHTML(quote: PricingQuote): string {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'לא זמין';
    return new Date(dateString).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const statusText = {
    draft: 'טיוטה',
    sent: 'נשלח',
    accepted: 'אושר',
    rejected: 'נדחה',
    expired: 'פג תוקף',
  }[quote.status] || quote.status;

  const lineItemsHTML = quote.line_items && quote.line_items.length > 0
    ? `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; direction: rtl; unicode-bidi: embed;">
        <thead>
          <tr style="background-color: #334155; color: white;">
            <th style="padding: 12px; text-align: right; font-weight: 600; unicode-bidi: embed;">פריט</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; unicode-bidi: embed;">תיאור</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; unicode-bidi: embed;">כמות</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; unicode-bidi: embed;">מחיר יחידה</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; unicode-bidi: embed;">סה"כ</th>
          </tr>
        </thead>
        <tbody>
          ${quote.line_items.map((item, index) => `
            <tr style="background-color: ${index % 2 === 0 ? '#f8fafc' : 'white'};">
              <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0; unicode-bidi: embed;">${item.name || ''}</td>
              <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0; unicode-bidi: embed;">${item.description || ''}</td>
              <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0; unicode-bidi: embed;">${item.quantity}</td>
              <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0; unicode-bidi: embed;">₪${item.unit_price.toFixed(2)}</td>
              <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e2e8f0; unicode-bidi: embed;">₪${item.total.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&display=swap');
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Assistant', 'Arial Hebrew', 'David', sans-serif;
          direction: rtl;
          text-align: right;
          padding: 40px;
          font-size: 12pt;
          color: #1e293b;
          line-height: 1.6;
          background: white;
          width: 210mm;
          unicode-bidi: embed;
        }
        .header {
          margin-bottom: 30px;
          display: flex;
          align-items: center;
          gap: 20px;
          direction: rtl;
        }
        .logo-container {
          flex-shrink: 0;
        }
        .logo {
          max-width: 120px;
          max-height: 80px;
          object-fit: contain;
        }
        .header-text {
          flex: 1;
        }
        .company-name {
          font-size: 24pt;
          font-weight: 700;
          color: #0ea5e9;
          margin-bottom: 10px;
        }
        .subtitle {
          font-size: 14pt;
          color: #64748b;
          margin-bottom: 20px;
        }
        .quote-title {
          font-size: 20pt;
          font-weight: 700;
          margin-bottom: 20px;
          color: #1e293b;
        }
        .quote-info {
          margin-bottom: 20px;
        }
        .quote-info p {
          margin: 5px 0;
          font-size: 11pt;
          unicode-bidi: embed;
        }
        .customer-info {
          margin-bottom: 20px;
          padding: 15px;
          background-color: #f8fafc;
          border-radius: 8px;
        }
        .customer-info h3 {
          font-size: 14pt;
          font-weight: 600;
          margin-bottom: 10px;
        }
        .customer-info p {
          unicode-bidi: embed;
        }
        .totals {
          margin: 20px 0;
          padding: 15px;
          background-color: #f1f5f9;
          border-radius: 8px;
          text-align: right;
          direction: rtl;
        }
        .totals p {
          margin: 8px 0;
          display: flex;
          justify-content: space-between;
          flex-direction: row-reverse;
        }
        .total-final {
          font-size: 14pt;
          font-weight: 700;
          border-top: 2px solid #334155;
          padding-top: 10px;
          margin-top: 10px;
        }
        .terms, .notes {
          margin: 20px 0;
        }
        .terms h3, .notes h3 {
          font-size: 14pt;
          font-weight: 600;
          margin-bottom: 10px;
        }
        .terms p, .notes p {
          white-space: pre-wrap;
          line-height: 1.8;
          unicode-bidi: embed;
        }
        .status {
          margin-top: 30px;
          padding: 10px;
          text-align: center;
          font-style: italic;
          color: #64748b;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-container">
          <img src="${getLogoUrl()}" alt="Logo" class="logo" onerror="this.style.display='none'">
        </div>
        <div class="header-text">
          <div class="company-name">RealMind</div>
          <div class="subtitle">מכינה למבחן תיווך מקרקעין</div>
        </div>
      </div>

      <div class="quote-title">הצעת מחיר</div>

      <div class="quote-info">
        <p><strong>מספר הצעה:</strong> ${quote.quote_number}</p>
        <p><strong>תאריך:</strong> ${formatDate(quote.quote_date)}</p>
        ${quote.valid_until ? `<p><strong>תוקף עד:</strong> ${formatDate(quote.valid_until)}</p>` : ''}
      </div>

      ${quote.user_name || quote.user_email ? `
      <div class="customer-info">
        <h3>פרטי לקוח</h3>
        ${quote.user_name ? `<p><strong>שם:</strong> ${quote.user_name}</p>` : ''}
        ${quote.user_email ? `<p><strong>אימייל:</strong> ${quote.user_email}</p>` : ''}
      </div>
      ` : ''}

      ${lineItemsHTML}

      ${(quote as any).show_price_summary !== false ? `
      <div class="totals">
        <p>
          <span>₪${quote.subtotal.toFixed(2)}</span>
          <span>סה"כ לפני מע"מ:</span>
        </p>
        ${quote.tax_rate > 0 ? `
        <p>
          <span>₪${quote.tax_amount.toFixed(2)}</span>
          <span>מע"מ <span dir="ltr" style="unicode-bidi: isolate;">(${quote.tax_rate}%)</span>:</span>
        </p>
        ` : ''}
        <p class="total-final">
          <span>₪${quote.total.toFixed(2)}</span>
          <span>סה"כ כולל מע"מ:</span>
        </p>
      </div>
      ` : ''}

      ${quote.terms ? `
      <div class="terms">
        <h3>תנאים</h3>
        <p>${quote.terms}</p>
      </div>
      ` : ''}

      ${quote.notes ? `
      <div class="notes">
        <h3>הערות</h3>
        <p>${quote.notes}</p>
      </div>
      ` : ''}

      <div class="status">סטטוס: ${statusText}</div>
    </body>
    </html>
  `;
}

/**
 * Generate a PDF for a pricing quote in Hebrew
 */
export async function generateQuotePDF(quote: PricingQuote): Promise<Blob> {
  // Create a temporary element with the HTML
  const element = document.createElement('div');
  element.innerHTML = generateQuoteHTML(quote);
  element.style.position = 'absolute';
  element.style.left = '-9999px';
  element.style.width = '210mm';
  document.body.appendChild(element);

  try {
    // Wait for fonts to load
    await document.fonts.ready;
    
    // Wait for images to load (especially the logo)
    const images = element.querySelectorAll('img');
    await Promise.all(
      Array.from(images).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = resolve; // Resolve even on error to not block PDF generation
          // Timeout after 3 seconds
          setTimeout(resolve, 3000);
        });
      })
    );

    // Convert HTML to canvas with high quality
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true, // Allow cross-origin images
      logging: false,
      backgroundColor: '#ffffff',
      width: element.scrollWidth,
      height: element.scrollHeight,
    });

    // Create PDF from canvas
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(element);
  }
}

/**
 * Download quote as PDF
 */
export async function downloadQuotePDF(quote: PricingQuote, filename?: string): Promise<void> {
  const blob = await generateQuotePDF(quote);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `quote-${quote.quote_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
