import * as pdfjsLib from 'pdfjs-dist';
import { supabase } from '../../services/authService';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface PDFChunk {
  pdf_name: string;
  page_number: number;
  law_name: string;
  law_year?: string;
  section_number?: string;
  chapter?: number;
  content: string;
}

/**
 * Extract text from PDF and parse into structured chunks
 */
export async function extractPdfChunks(pdfFile: File | Blob): Promise<PDFChunk[]> {
  const pdf = await pdfjsLib.getDocument(await pdfFile.arrayBuffer()).promise;
  const chunks: PDFChunk[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();

      if (text.length > 50) {
        // Parse law name and year
        const lawMatch = text.match(/חוק\s+([^,]+),\s+ה(תש[ך-ם]["]?[א-ת]["]?)\s*[-–]\s*(\d{4})/);
        const lawName = lawMatch ? `חוק ${lawMatch[1]}` : 'Unknown';
        const lawYear = lawMatch ? lawMatch[3] : undefined;

        // Parse section numbers
        const sections = text.match(/סעיף\s+([0-9א-תא-ת]+[א-ת]?)/g);
        const sectionNumber = sections ? sections[0].replace('סעיף ', '').trim() : undefined;

        // Try to extract chapter number from content
        const chapterMatch = text.match(/פרק\s+([א-ת]+|[0-9]+)/);
        const chapter = chapterMatch ? parseInt(chapterMatch[1]) || undefined : undefined;

        chunks.push({
          pdf_name: 'part1.pdf',
          page_number: pageNum,
          law_name: lawName,
          law_year: lawYear,
          section_number: sectionNumber,
          chapter: chapter,
          content: text.substring(0, 3000) // Store up to 3000 chars
        });
      }
    } catch (error) {
      console.warn(`⚠️ Error processing page ${pageNum}:`, error);
    }
  }

  return chunks;
}

/**
 * Store PDF chunks in database
 */
export async function storePdfChunks(chunks: PDFChunk[]): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('pdf_chunks')
      .insert(chunks, { onConflict: 'ignore' });

    if (error) {
      console.error('❌ Error storing chunks:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ Error inserting chunks:', err);
    return false;
  }
}

/**
 * Extract and store PDF chunks in one go
 */
export async function extractAndStorePdfChunks(pdfFile: File | Blob): Promise<boolean> {
  try {
    const chunks = await extractPdfChunks(pdfFile);
    return await storePdfChunks(chunks);
  } catch (error) {
    console.error('❌ Error in extraction and storage:', error);
    return false;
  }
}

