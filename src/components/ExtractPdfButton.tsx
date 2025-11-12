import React, { useState } from 'react';
import { extractAndStorePdfChunks } from '../utils/pdfExtractor';
import { supabase } from '../services/authService';

export const ExtractPdfButton: React.FC = () => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [isComplete, setIsComplete] = useState(false);

  const handleExtractPdf = async () => {
    setIsExtracting(true);
    setExtractionStatus('🔄 Downloading PDF from storage...');
    setIsComplete(false);

    try {
      // Download part1.pdf from Supabase Storage
      const { data, error } = await supabase.storage
        .from('Materials')
        .download('part1.pdf');

      if (error || !data) {
        setExtractionStatus(`❌ Error downloading PDF: ${error?.message || 'Unknown error'}`);
        setIsExtracting(false);
        return;
      }

      setExtractionStatus('📄 Extracting PDF text...');

      // Extract and store chunks
      const success = await extractAndStorePdfChunks(data);

      if (success) {
        setExtractionStatus('✅ PDF successfully extracted and stored in database!');
        setIsComplete(true);
      } else {
        setExtractionStatus('❌ Error storing chunks in database');
      }
    } catch (error) {
      setExtractionStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div style={{
      padding: '20px',
      margin: '20px',
      border: '2px solid #ddd',
      borderRadius: '8px',
      backgroundColor: '#f9f9f9'
    }}>
      <h3>📚 Extract PDF to Database</h3>
      <p>This will break down part1.pdf into the database for precise reference lookups.</p>
      
      <button
        onClick={handleExtractPdf}
        disabled={isExtracting}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: isComplete ? '#4CAF50' : '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isExtracting ? 'not-allowed' : 'pointer',
          opacity: isExtracting ? 0.6 : 1
        }}
      >
        {isExtracting ? '⏳ Extracting...' : isComplete ? '✅ Complete' : '🔍 Extract PDF'}
      </button>

      {extractionStatus && (
        <p style={{
          marginTop: '10px',
          padding: '10px',
          backgroundColor: isComplete ? '#e8f5e9' : '#fff3e0',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          {extractionStatus}
        </p>
      )}
    </div>
  );
};

