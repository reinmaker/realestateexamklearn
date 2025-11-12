import { useEffect, useRef } from 'react';
import { extractAndStorePdfChunks } from '../utils/pdfExtractor';
import { supabase } from '../services/authService';

/**
 * Hook to automatically extract and store PDF chunks on app load
 * Only runs once per app session
 */
export const usePdfExtraction = () => {
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return; // Only run once
    hasRunRef.current = true;

    const extractPdfAutomatically = async () => {
      try {
        // Check if chunks already exist in database
        const { data: existingChunks, error: checkError } = await supabase
          .from('pdf_chunks')
          .select('count', { count: 'exact' });

        if (!checkError && existingChunks && (existingChunks as any).count > 0) {
          return;
        }

        // Download part1.pdf from Supabase Storage
        const { data, error } = await supabase.storage
          .from('Materials')
          .download('part1.pdf');

        if (error || !data) {
          console.warn('⚠️ [Auto] Error downloading PDF:', error?.message || 'Unknown error');
          return;
        }

        // Extract and store chunks
        const success = await extractAndStorePdfChunks(data);

        if (!success) {
          console.warn('⚠️ [Auto] Error storing chunks in database');
        }
      } catch (error) {
        console.warn('⚠️ [Auto] Error in automatic PDF extraction:', error instanceof Error ? error.message : 'Unknown error');
        // Don't throw - this is optional and shouldn't break the app
      }
    };

    // Run extraction after a short delay to let the app initialize
    const timeoutId = setTimeout(() => {
      extractPdfAutomatically();
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, []);
};

