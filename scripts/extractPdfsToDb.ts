#!/usr/bin/env ts-node

/**
 * Script to extract both part1.pdf and part2.pdf and populate the database
 * Run with: npm run extract-pdfs
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// Supabase configuration (from authService.ts)
const supabaseUrl = 'https://arhoasurtfurjgfohlgt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyaG9hc3VydGZ1cmpnZm9obGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDQ5MDIsImV4cCI6MjA3NzgyMDkwMn0.FwXMPAnBpOhZnAg90PUQttaSvpgvVbRb_xNctF-reWw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface PDFChunk {
  pdf_name: string;
  page_number: number;
  law_name: string;
  law_year?: string;
  section_number?: string;
  chapter?: number;
  content: string;
}

/**
 * Download PDF from Supabase Storage
 */
async function downloadPdf(filename: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from('Materials')
    .download(filename);

  if (error || !data) {
    throw new Error(`Failed to download ${filename}: ${error?.message || 'Unknown error'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extract text from PDF buffer
 */
async function extractPdfChunks(pdfBuffer: Buffer, pdfName: string): Promise<PDFChunk[]> {
  // Convert Buffer to Uint8Array as required by pdfjs
  const uint8Array = new Uint8Array(pdfBuffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;
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
        const lawMatch = text.match(/חוק\s+([^,]+),\s+ה(תש[ך-ת]["]?[א-ת]+["]?)\s*[-–]\s*(\d{4})/);
        const lawName = lawMatch ? `חוק ${lawMatch[1].trim()}` : 'Unknown';
        const lawYear = lawMatch ? lawMatch[3] : undefined;

        // Parse section numbers
        const sections = text.match(/סעיף\s+([0-9א-ת]+[א-ת]?)/g);
        const sectionNumber = sections ? sections[0].replace('סעיף ', '').trim() : undefined;

        // Try to extract chapter number
        const chapterMatch = text.match(/פרק\s+([א-ת]+|[0-9]+)/);
        const chapter = chapterMatch ? (
          isNaN(parseInt(chapterMatch[1])) ? undefined : parseInt(chapterMatch[1])
        ) : undefined;

        chunks.push({
          pdf_name: pdfName,
          page_number: pageNum,
          law_name: lawName,
          law_year: lawYear,
          section_number: sectionNumber,
          chapter: chapter,
          content: text.substring(0, 3000) // Store up to 3000 chars
        });
      }
    } catch (error) {
      console.warn(`⚠️  Error processing page ${pageNum}:`, error);
    }
  }

  return chunks;
}

/**
 * Store chunks in database
 */
async function storeChunks(chunks: PDFChunk[]): Promise<void> {
  // Insert in batches of 100
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('pdf_chunks')
      .insert(batch);

    if (error) {
      console.error(`❌ Error storing batch ${i / batchSize + 1}:`, error);
      throw error;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check if chunks already exist
    const { count, error: countError } = await supabase
      .from('pdf_chunks')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.warn('⚠️  Could not check existing chunks:', countError.message);
    } else if (count && count > 0) {
      process.exit(0);
    }

    // Extract Part 1
    const part1Buffer = await downloadPdf('part1.pdf');
    const part1Chunks = await extractPdfChunks(part1Buffer, 'part1.pdf');
    await storeChunks(part1Chunks);

    // Extract Part 2
    const part2Buffer = await downloadPdf('part2.pdf');
    const part2Chunks = await extractPdfChunks(part2Buffer, 'part2.pdf');
    await storeChunks(part2Chunks);

  } catch (error) {
    console.error('\n❌ Error during extraction:', error);
    process.exit(1);
  }
}

// Run the script
main();

