// Import functions will be done dynamically to avoid circular dependencies

/**
 * DEPRECATED: Hardcoded PDF URLs are no longer used.
 * All PDF downloads should use Supabase storage directly via:
 * - downloadPdfFilePart1() - downloads part1.pdf
 * - downloadPdfFilePart2() - downloads part2.pdf
 * 
 * These functions handle signed URL generation and direct downloads
 * with proper error handling and timeout protection.
 * 
 * The old URL constants are kept for reference only and should not be used.
 */

/**
 * Cache for PDF file data (part 1)
 */
let cachedPdfFile: File | Blob | null = null;
let pdfDownloadInProgress: Promise<File | Blob> | null = null;

/**
 * Cache for PDF file data (part 2)
 */
let cachedPdfFilePart2: File | Blob | null = null;
let pdfDownloadInProgressPart2: Promise<File | Blob> | null = null;

/**
 * Download PDF part 1 from Supabase storage
 */
async function downloadPdfFilePart1(): Promise<File | Blob> {
  // Return cached file if available
  if (cachedPdfFile) {
    return cachedPdfFile;
  }
  
  // If download is in progress, wait for it
  if (pdfDownloadInProgress) {
    return pdfDownloadInProgress;
  }
  
  // Start download (single attempt, no retry)
  pdfDownloadInProgress = (async () => {
    try {
      // Import Supabase client
      const { supabase } = await import('./authService');
      
      // First, try to generate a signed URL (works even if bucket is private)
      // With the new policy, authenticated users can access the bucket directly
      let signedUrlData: { signedUrl: string } | null = null;
      let signedUrlError: any = null;
      
      try {
        // Try direct signed URL generation first (for authenticated users with new policy)
        const result = await supabase.storage
          .from('Materials')
          .createSignedUrl('part1.pdf', 3600); // 1 hour expiry
        
        signedUrlData = result.data;
        signedUrlError = result.error;
        
        // If direct signed URL generation failed, try Edge Function as fallback
        if (signedUrlError || !signedUrlData?.signedUrl) {
          try {
            const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('get-pdf-signed-url', {
              body: { filename: 'part1.pdf', expiresIn: 3600 }
            });
            
            if (!edgeFunctionError && edgeFunctionData?.signedUrl) {
              signedUrlData = { signedUrl: edgeFunctionData.signedUrl };
              signedUrlError = null;
            } else {
              console.warn('Edge Function also failed:', edgeFunctionError);
            }
          } catch (edgeErr) {
            console.warn('Edge Function invocation failed:', edgeErr);
          }
        }
      } catch (err) {
        signedUrlError = err;
        console.warn('Failed to generate signed URL:', err);
      }
      
      // If signed URL generation failed, try direct download
      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.warn('Signed URL generation failed, trying direct download:', signedUrlError);
        
        // Fallback to direct download with timeout
        const downloadPromise = supabase.storage
          .from('Materials')
          .download('part1.pdf');
        
        // Add timeout (30 seconds)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Download timeout after 30 seconds')), 30000)
        );
        
        const { data, error } = await Promise.race([downloadPromise, timeoutPromise]) as any;
        
        if (error) {
          const errorStatus = (error as any)?.status || (error as any)?.statusCode;
          const errorMessage = error.message || '';
          const errorCode = error.error || '';
          
          console.error('Supabase storage download failed for part 1:', {
            error,
            status: errorStatus,
            code: errorCode,
            message: errorMessage
          });
          
          throw new Error(`Failed to download PDF part 1 from Supabase storage: ${errorMessage || errorCode || 'Unknown error'} (Status: ${errorStatus || 'N/A'})`);
        }
        
        if (!data) {
          throw new Error('Supabase storage returned no data for part 1');
        }
        
        const pdfBlob = data;
        
        // Cache the result
        cachedPdfFile = pdfBlob;
        pdfDownloadInProgress = null;
        
        return pdfBlob;
      }
      
      // Use signed URL to download with timeout
      if (signedUrlData?.signedUrl) {
        const fetchPromise = fetch(signedUrlData.signedUrl);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Fetch timeout after 30 seconds')), 30000)
        );
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF from signed URL: ${response.status} ${response.statusText}`);
        }
        
        const pdfBlob = await response.blob();
        
        if (!pdfBlob || pdfBlob.size === 0) {
          throw new Error('Downloaded PDF is empty');
        }
        
        // Cache the result
        cachedPdfFile = pdfBlob;
        pdfDownloadInProgress = null;
        
        return pdfBlob;
      }
      
      throw new Error('Failed to generate signed URL for PDF part 1');
    } catch (error) {
      pdfDownloadInProgress = null;
      throw error instanceof Error ? error : new Error(String(error));
    }
  })();
  
  return pdfDownloadInProgress;
}

/**
 * Download PDF part 2 from Supabase storage
 */
async function downloadPdfFilePart2(): Promise<File | Blob> {
  // Return cached file if available
  if (cachedPdfFilePart2) {
    return cachedPdfFilePart2;
  }
  
  // If download is in progress, wait for it
  if (pdfDownloadInProgressPart2) {
    return pdfDownloadInProgressPart2;
  }
  
  // Start download (single attempt, no retry)
  pdfDownloadInProgressPart2 = (async () => {
    try {
      // Import Supabase client
      const { supabase } = await import('./authService');
      
      // First, try to generate a signed URL (works even if bucket is private)
      // With the new policy, authenticated users can access the bucket directly
      let signedUrlData: { signedUrl: string } | null = null;
      let signedUrlError: any = null;
      
      try {
        // Try direct signed URL generation first (for authenticated users with new policy)
        const result = await supabase.storage
          .from('Materials')
          .createSignedUrl('part2.pdf', 3600); // 1 hour expiry
        
        signedUrlData = result.data;
        signedUrlError = result.error;
        
        // If direct signed URL generation failed, try Edge Function as fallback
        if (signedUrlError || !signedUrlData?.signedUrl) {
          try {
            const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('get-pdf-signed-url', {
              body: { filename: 'part2.pdf', expiresIn: 3600 }
            });
            
            if (!edgeFunctionError && edgeFunctionData?.signedUrl) {
              signedUrlData = { signedUrl: edgeFunctionData.signedUrl };
              signedUrlError = null;
            } else {
              console.warn('Edge Function also failed:', edgeFunctionError);
            }
          } catch (edgeErr) {
            console.warn('Edge Function invocation failed:', edgeErr);
          }
        }
      } catch (err) {
        signedUrlError = err;
        console.warn('Failed to generate signed URL:', err);
      }
      
      // If signed URL generation failed, try direct download
      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.warn('Signed URL generation failed, trying direct download:', signedUrlError);
        
        // Fallback to direct download with timeout
        const downloadPromise = supabase.storage
          .from('Materials')
          .download('part2.pdf');
        
        // Add timeout (30 seconds)
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Download timeout after 30 seconds')), 30000)
        );
        
        const { data, error } = await Promise.race([downloadPromise, timeoutPromise]) as any;
        
        if (error) {
          const errorStatus = (error as any)?.status || (error as any)?.statusCode;
          const errorMessage = error.message || '';
          const errorCode = error.error || '';
          
          // Check if it's a "not found" error - if so, throw immediately
          const isNotFoundError = errorMessage?.includes('Object not found') || 
                                 errorMessage?.includes('not found') ||
                                 errorCode === '404' ||
                                 errorStatus === 404 ||
                                 errorStatus === 400; // 400 Bad Request often means not found
          
          if (isNotFoundError) {
            // If file doesn't exist, throw immediately
            throw new Error('PDF file not found in storage');
          }
          
          console.error('Supabase storage download failed for part 2:', {
            error,
            status: errorStatus,
            code: errorCode,
            message: errorMessage
          });
          
          throw new Error(`Failed to download PDF part 2 from Supabase storage: ${errorMessage || errorCode || 'Unknown error'} (Status: ${errorStatus || 'N/A'})`);
        }
        
        if (!data) {
          throw new Error('Supabase storage returned no data for part 2');
        }
        
        const pdfBlob = data;
        
        // Cache the result
        cachedPdfFilePart2 = pdfBlob;
        pdfDownloadInProgressPart2 = null;
        
        return pdfBlob;
      }
      
      // Use signed URL to download with timeout
      if (signedUrlData?.signedUrl) {
        const fetchPromise = fetch(signedUrlData.signedUrl);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Fetch timeout after 30 seconds')), 30000)
        );
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF from signed URL: ${response.status} ${response.statusText}`);
        }
        
        const pdfBlob = await response.blob();
        
        if (!pdfBlob || pdfBlob.size === 0) {
          throw new Error('Downloaded PDF is empty');
        }
        
        // Cache the result
        cachedPdfFilePart2 = pdfBlob;
        pdfDownloadInProgressPart2 = null;
        
        return pdfBlob;
      }
      
      throw new Error('Failed to generate signed URL for PDF part 2');
    } catch (error) {
      pdfDownloadInProgressPart2 = null;
      throw error instanceof Error ? error : new Error(String(error));
    }
  })();
  
  return pdfDownloadInProgressPart2;
}

/**
 * Download PDF from Supabase storage (legacy function - downloads part 1)
 */
async function downloadPdfFile(): Promise<File | Blob> {
  return downloadPdfFilePart1();
}

/**
 * Get book PDF file part 1 (with caching)
 */
export async function getBookPdfFilePart1(): Promise<File | Blob | null> {
  try {
    return await downloadPdfFilePart1();
  } catch (error: any) {
    // If PDF is not found, return null gracefully (don't log as error)
    const isNotFoundError = error?.message?.includes('not found in storage') ||
                           error?.message?.includes('Object not found') ||
                           error?.code === '404' ||
                           error?.status === 404 ||
                           error?.statusCode === 400; // 400 Bad Request often means not found
    
    if (isNotFoundError) {
      console.warn('PDF part 1 not found in storage, skipping PDF attachment');
      return null;
    }
    
    console.error('Failed to get PDF file part 1:', error);
    return null;
  }
}

/**
 * Get book PDF file part 2 (with caching)
 */
export async function getBookPdfFilePart2(): Promise<File | Blob | null> {
  try {
    return await downloadPdfFilePart2();
  } catch (error: any) {
    // If PDF is not found, return null gracefully (don't log as error)
    const isNotFoundError = error?.message?.includes('not found in storage') ||
                           error?.message?.includes('Object not found') ||
                           error?.code === '404' ||
                           error?.status === 404 ||
                           error?.statusCode === 400; // 400 Bad Request often means not found
    
    if (isNotFoundError) {
      console.warn('PDF part 2 not found in storage, skipping PDF attachment');
      return null;
    }
    
    console.error('Failed to get PDF file part 2:', error);
    return null;
  }
}

/**
 * Get book PDF file (legacy function - returns part 1)
 */
export async function getBookPdfFile(): Promise<File | Blob | null> {
  return getBookPdfFilePart1();
}

/**
 * Helper function to upload both PDFs to OpenAI and create vector stores
 * Returns an object with uploaded files and vector store IDs
 */
export async function attachBookPdfsToOpenAI(openai: any): Promise<{
  part1FileId: string | null;
  part2FileId: string | null;
  vectorStoreIds: string[];
  fileIds: string[]; // Add fileIds for direct file_search usage
  cleanup: () => Promise<void>;
}> {
  const uploadedFiles: string[] = [];
  const vectorStoreIds: string[] = [];
  const fileIds: string[] = [];
  let fileStatus: string = 'unknown'; // Declare fileStatus at function level
  let waitCount = 0; // Declare waitCount at function level
  const maxWaitTime = 60; // Maximum wait time in seconds for file/vector store processing
  
  try {
    // Upload part 1 PDF
    const pdfFilePart1 = await getBookPdfFilePart1();
    let part1FileId: string | null = null;
    
    if (pdfFilePart1) {
      const file1 = pdfFilePart1 instanceof File ? pdfFilePart1 : new File([pdfFilePart1], 'part1.pdf', { type: 'application/pdf' });
      
      const uploadedFile1 = await openai.files.create({
        file: file1,
        purpose: 'assistants'
      });
      
      part1FileId = uploadedFile1.id;
      uploadedFiles.push(part1FileId);
      fileIds.push(part1FileId); // Add to fileIds for direct file_search usage
      
      // Wait for file to be processed
      fileStatus = uploadedFile1.status;
      waitCount = 0;
      while ((fileStatus === 'uploaded' || fileStatus === 'processing') && waitCount < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fileInfo = await openai.files.retrieve(part1FileId);
        fileStatus = fileInfo.status;
        waitCount++;
        if (fileStatus === 'error') {
          throw new Error('Part 1 file processing failed');
        }
      }
      
      if (waitCount >= maxWaitTime) {
        throw new Error('Part 1 file processing timeout');
      }
      
      // Skip vector stores - using fast chat completions instead of Assistants API
    }
    
    // Upload part 2 PDF
    const pdfFilePart2 = await getBookPdfFilePart2();
    let part2FileId: string | null = null;
    
    if (pdfFilePart2) {
      const file2 = pdfFilePart2 instanceof File ? pdfFilePart2 : new File([pdfFilePart2], 'part2.pdf', { type: 'application/pdf' });
      
      const uploadedFile2 = await openai.files.create({
        file: file2,
        purpose: 'assistants'
      });
      
      part2FileId = uploadedFile2.id;
      uploadedFiles.push(part2FileId);
      fileIds.push(part2FileId); // Add to fileIds for direct file_search usage
      
      // Wait for file to be processed
      fileStatus = uploadedFile2.status;
      waitCount = 0;
      while ((fileStatus === 'uploaded' || fileStatus === 'processing') && waitCount < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fileInfo = await openai.files.retrieve(part2FileId);
        fileStatus = fileInfo.status;
        waitCount++;
        if (fileStatus === 'error') {
          throw new Error('Part 2 file processing failed');
        }
      }
      
      if (waitCount >= maxWaitTime) {
        throw new Error('Part 2 file processing timeout');
      }
      
      // Skip vector stores - using fast chat completions instead
    }
    
    // Cleanup function
    const cleanup = async () => {
      try {
        // Delete vector stores
        for (const storeId of vectorStoreIds) {
          try {
            await openai.beta.vectorStores.del(storeId);
          } catch (error) {
            console.warn('Failed to delete vector store:', storeId, error);
          }
        }
        
        // Delete uploaded files
        for (const fileId of uploadedFiles) {
          try {
            await openai.files.delete(fileId);
          } catch (error) {
            console.warn('Failed to delete uploaded file:', fileId, error);
          }
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    };
    
    // Log the result
    if (vectorStoreIds.length > 0) {
      console.log('✅ PDF attachment complete: vector stores available', { vectorStoreCount: vectorStoreIds.length, fileCount: fileIds.length });
    } else {
      console.warn('⚠️ PDF attachment complete: NO vector stores created');
      console.warn('   Files uploaded successfully: ', fileIds.length);
      console.warn('   Fallback: Using table of contents and chat completions instead of file_search');
      console.log('📋 OpenAI SDK Info:', {
        sdkHasVectorStores: !!openai.beta?.vectorStores,
        vectorStoresType: typeof openai.beta?.vectorStores,
        betaAPIMethods: openai.beta ? Object.keys(openai.beta).filter(k => typeof openai.beta[k] === 'object' || typeof openai.beta[k] === 'function').slice(0, 10) : 'N/A'
      });
    }
    
    return {
      part1FileId,
      part2FileId,
      vectorStoreIds,
      fileIds, // Include fileIds for direct file_search usage
      cleanup
    };
  } catch (error) {
    console.error('Error attaching PDFs to OpenAI:', error);
    // Cleanup on error
    try {
      for (const storeId of vectorStoreIds) {
        try {
          await openai.beta.vectorStores.del(storeId);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      for (const fileId of uploadedFiles) {
        try {
          await openai.files.delete(fileId);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Helper function to upload both PDFs to Gemini and attach to content
 * Returns an object with uploaded file URIs and parts array for content
 */
export async function attachBookPdfsToGemini(ai: any): Promise<{
  part1FileUri: string | null;
  part2FileUri: string | null;
  parts: any[];
  cleanup: () => Promise<void>;
}> {
  const uploadedFiles: any[] = [];
  const parts: any[] = [];
  let fileState: string | undefined;
  let waitCount: number = 0;
  const maxWaitTime = 60;
  
  try {
    // Upload part 1 PDF
    const pdfFilePart1 = await getBookPdfFilePart1();
    let part1FileUri: string | null = null;
    
    if (pdfFilePart1) {
      const file1 = pdfFilePart1 instanceof File ? pdfFilePart1 : new File([pdfFilePart1], 'part1.pdf', { type: 'application/pdf' });
      
      const uploadedFile1 = await ai.files.upload({
        file: file1,
        config: {
          displayName: 'part1.pdf',
        },
      });
      
      // Handle different possible response structures
      if (!uploadedFile1) {
        throw new Error('Uploaded file 1 is null or undefined');
      }
      
      // Check if the response has a .file property or if the response itself is the file
      const fileInfo = uploadedFile1.file || uploadedFile1;
      if (!fileInfo) {
        throw new Error('File info is missing from upload response');
      }
      
      // Get URI - it might be in fileInfo.uri or fileInfo.fileUri
      part1FileUri = fileInfo.uri || fileInfo.fileUri || fileInfo.name;
      if (!part1FileUri) {
        console.error('Could not find URI in file info:', fileInfo);
        throw new Error('File URI is missing from upload response');
      }
      
      uploadedFiles.push(uploadedFile1);
      
      // Wait for file to be processed
      fileState = fileInfo.state;
      waitCount = 0;
      while (fileState === 'PROCESSING' && waitCount < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fileName = fileInfo.name || uploadedFile1.file?.name || uploadedFile1.name;
        if (!fileName) {
          console.warn('Could not get file name for status check, assuming ready');
          break;
        }
        const fileStatusInfo = await ai.files.get({ name: fileName });
        fileState = fileStatusInfo.state || fileStatusInfo.file?.state;
        waitCount++;
        if (fileState === 'FAILED') {
          throw new Error('Part 1 file processing failed');
        }
      }
      
      if (waitCount >= maxWaitTime) {
        throw new Error('Part 1 file processing timeout');
      }
      
      // Add file data to parts
      parts.push({
        fileData: {
          mimeType: 'application/pdf',
          fileUri: part1FileUri,
        },
      });
    }
    
    // Upload part 2 PDF
    const pdfFilePart2 = await getBookPdfFilePart2();
    let part2FileUri: string | null = null;
    
    if (pdfFilePart2) {
      const file2 = pdfFilePart2 instanceof File ? pdfFilePart2 : new File([pdfFilePart2], 'part2.pdf', { type: 'application/pdf' });
      
      const uploadedFile2 = await ai.files.upload({
        file: file2,
        config: {
          displayName: 'part2.pdf',
        },
      });
      
      // Handle different possible response structures
      if (!uploadedFile2) {
        throw new Error('Uploaded file 2 is null or undefined');
      }
      
      // Check if the response has a .file property or if the response itself is the file
      const fileInfo2 = uploadedFile2.file || uploadedFile2;
      if (!fileInfo2) {
        throw new Error('File info is missing from upload response (part 2)');
      }
      
      // Get URI - it might be in fileInfo2.uri or fileInfo2.fileUri
      part2FileUri = fileInfo2.uri || fileInfo2.fileUri || fileInfo2.name;
      if (!part2FileUri) {
        console.error('Could not find URI in file info (part 2):', fileInfo2);
        throw new Error('File URI is missing from upload response (part 2)');
      }
      
      uploadedFiles.push(uploadedFile2);
      
      // Wait for file to be processed
      fileState = fileInfo2.state;
      waitCount = 0;
      while (fileState === 'PROCESSING' && waitCount < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const fileName2 = fileInfo2.name || uploadedFile2.file?.name || uploadedFile2.name;
        if (!fileName2) {
          console.warn('Could not get file name for status check (part 2), assuming ready');
          break;
        }
        const fileStatusInfo2 = await ai.files.get({ name: fileName2 });
        fileState = fileStatusInfo2.state || fileStatusInfo2.file?.state;
        waitCount++;
        if (fileState === 'FAILED') {
          throw new Error('Part 2 file processing failed');
        }
      }
      
      if (waitCount >= maxWaitTime) {
        throw new Error('Part 2 file processing timeout');
      }
      
      // Add file data to parts
      parts.push({
        fileData: {
          mimeType: 'application/pdf',
          fileUri: part2FileUri,
        },
      });
    }
    
    // Cleanup function
    const cleanup = async () => {
      try {
        for (const uploadedFile of uploadedFiles) {
          if (!uploadedFile) {
            console.warn('Skipping cleanup for undefined uploadedFile');
            continue;
          }
          
          try {
            // Handle different possible response structures
            const fileInfo = uploadedFile.file || uploadedFile;
            if (!fileInfo) {
              console.warn('Skipping cleanup - file info is missing');
              continue;
            }
            
            const fileName = fileInfo.name || uploadedFile.name;
            if (!fileName) {
              console.warn('Skipping cleanup - file name is missing');
              continue;
            }
            
            await ai.files.delete({ name: fileName });
          } catch (error) {
            const fileInfo = uploadedFile?.file || uploadedFile;
            const fileName = fileInfo?.name || uploadedFile?.name || 'unknown';
            console.warn('Failed to delete uploaded file from Gemini:', fileName, error);
          }
        }
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    };
    
    return {
      part1FileUri,
      part2FileUri,
      parts,
      cleanup
    };
  } catch (error) {
    console.error('Error attaching PDFs to Gemini:', error);
    // Cleanup on error
    try {
      for (const uploadedFile of uploadedFiles) {
        try {
          const fileInfo = uploadedFile?.file || uploadedFile;
          const fileName = fileInfo?.name || uploadedFile?.name;
          if (fileName) {
            await ai.files.delete({ name: fileName });
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Cache for extracted PDF text to avoid re-extracting on every call
 */
let cachedPdfText: string | null = null;
let pdfExtractionInProgress: Promise<string> | null = null;

/**
 * Download PDF from Supabase storage and extract text (fallback method)
 */
async function extractPdfText(): Promise<string> {
  // Return cached text if available
  if (cachedPdfText) {
    return cachedPdfText;
  }
  
  // If extraction is in progress, wait for it
  if (pdfExtractionInProgress) {
    return pdfExtractionInProgress;
  }
  
  // Start extraction
  pdfExtractionInProgress = (async () => {
    try {
      // Import Supabase client
      const { supabase } = await import('./authService');
      
      // Use the downloadPdfFilePart1 function which has retry logic and proper error handling
      // This ensures we use the same robust download mechanism as other parts of the code
      const pdfBlob = await downloadPdfFilePart1();
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfBytes = new Uint8Array(arrayBuffer);
      
      // Import pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');
      
      // Set worker source (required for pdfjs-dist)
      if (typeof window !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      }
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const pdf = await loadingTask.promise;
      
      // Extract text from all pages
      const textParts: string[] = [];
      const maxPages = Math.min(pdf.numPages, 200); // Limit to 200 pages to avoid memory issues
      
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Combine text items with page number
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        textParts.push(`עמוד ${pageNum}:\n${pageText}\n`);
      }
      
      const extractedText = textParts.join('\n---\n\n');
      
      // Cache the result
      cachedPdfText = extractedText;
      pdfExtractionInProgress = null;
      
      return extractedText;
    } catch (error) {
      pdfExtractionInProgress = null;
      console.error('Error extracting PDF text:', error);
      throw error;
    }
  })();
  
  return pdfExtractionInProgress;
}

/**
 * Get book PDF text (with caching)
 */
export async function getBookPdfText(): Promise<string> {
  try {
    return await extractPdfText();
  } catch (error) {
    console.error('Failed to get PDF text, returning empty string:', error);
    return '';
  }
}

/**
 * Complete table of contents for חלק 1 of the exam book
 * This includes general table, detailed table, and topic index
 */
export const TABLE_OF_CONTENTS = `תוכן העניינים הכללי
פרק 1: מתווכים
חוק המתווכים במקרקעין, התשנ"ו–1996................................................................................................................... 1
תקנות המתווכים במקרקעין, התשנ"ז–1997............................................................................................................. 10
תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997.............................................................................. 15
תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997 ...................................................................................... 15
תקנות המתווכים במקרקעין (פעולות שיווק), התשס"ה–2004................................................................................... 17
פרק 2: הגנת הצרכן
חוק הגנת הצרכן, התשמ"א–1981............................................................................................................................ 18
תקנות הגנת הצרכן (האותיות בחוזה אחיד ובתנאי הכלול במידע אחר המיועד לצרכן), התשנ"ה–1995 ....................... 25
פרק 3: חוזים
חוק החוזים (חלק כללי), התשל"ג–1973................................................................................................................... 26
חוק החוזים (תרופות בשל הפרת חוזה), התשל"א–1970............................................................................................ 29
חוק החוזים האחידים, התשמ"ג–1982...................................................................................................................... 31
פרק 4: מקרקעין
חוק המקרקעין, התשכ"ט–1969............................................................................................................................... 33
חוק המקרקעין (חיזוק בתים משותפים מפני רעידות אדמה), התשס"ח–2008............................................................. 54
פרק 5: מכר
חוק המכר (דירות), התשל"ג–1973 .......................................................................................................................... 57
צו מכר דירות (טופס של מפרט), התשל"ד–1974 ..................................................................................................... 62
חוק המכר (דירות) (הבטחת השקעות של רוכשי דירות), התשל"ה–1974 ................................................................... 73
פרק 6: הגנת הדייר
חוק הגנת הדייר [נוסח משולב], התשל"ב–1972....................................................................................................... 80
פרק 7: תכנון ובנייה
חוק התכנון והבנייה, התשכ"ה–1965........................................................................................................................ 90
פרק 8: מיסוי מקרקעין
חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג–1963................................................................................................ 128
פרק 9: עונשין
חוק העונשין, התשל"ז–1977 ................................................................................................................................. 140
פרק 10: רישוי עסקים
חוק רישוי עסקים, התשכ"ח–1968......................................................................................................................... 142
צו רישוי עסקים (עסקים טעוני רישוי), התשע"ג–2013 ........................................................................................... 149
פרק 11: מקרקעי ישראל
חוק־יסוד: מקרקעי ישראל..................................................................................................................................... 169
חוק מקרקעי ישראל, התש"ך–1960........................................................................................................................ 169
פרק 12: הוצאה לפועל
חוק ההוצאה לפועל, התשכ"ז–1967....................................................................................................................... 172
תקנות ההוצאה לפועל, התש"ם–1979.................................................................................................................... 173
פרק 13: שמאי מקרקעין
חוק שמאי מקרקעין, התשס"א–2001 ..................................................................................................................... 177
פרק 14: ירושה
חוק הירושה, התשכ"ה–1965................................................................................................................................. 178

מפתח נושאים מפורט (חלקי):
מתווכים .......................................................................... 1
-דמי תיווך .............................................. (9) 2
-הזמנה בכתב ................................... (9) 2, (תקנות) 15
-ביטול הזמנה, ביטול הסכם תיווך ................ (9) 2, (10) 2
-מתווך, הגדרה................................................... (1) 1
-רישיון
--בחינה.................................................. (6) 2, (2+) 10
--תנאים ............................................................. (5) 2
-תיווך ................................................................ (1) 1
-עניין אישי, גילוי ............................................ (10) 2

תוכן העניינים המפורט - פרק 1: מתווכים
חוק המתווכים במקרקעין, התשנ"ו–1996 ................................................................................................................... 1
תקנות המתווכים במקרקעין, התשנ"ז–1997 ............................................................................................................. 10
פרק א': כללי .................................................................................................................................................................... 10
פרק ב': סדרי הבחינה........................................................................................................................................................ 10
פרק ג': רשיון ואגרות ........................................................................................................................................................ 11
תוספת.............................................................................................................................................................................. 12
תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997 .............................................................................. 15
תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997 ...................................................................................... 15
תקנות המתווכים במקרקעין (פעולות שיווק), התשס"ה–2004................................................................................... 17

הגנת הצרכן ................................................................... 18
-ביטול מכר.................................................... (32) 24
-הגדרות........................................................... (1) 18
-הטעיה, איסור................................................. (2) 18
-חוזה אחיד .................................................... (4א) 20
-פיצויים......................................................... (31) 22

חוזים................................................................. 26, 29, 31
-אונס............................................................. (17) 27
-אכיפה ........................................................... (3+) 29
-ביטול חוזה ..................................... (13+) 27, (6+) 29
-הפרת חוזה .................................................... (1+) 29
-הצעה ............................................................ (2+) 26
-קיבול הצעה................................................... (5+) 26
-קיום החוזה.................................................. (39+) 28
-תרופות בשל הפרה......................................... (1+) 29

מקרקעין........................................................................ 33
-אסיפות בבית משותף ........................ (70) 43, (5+) 51
-בית משותף..................................... (42) 37, (52+) 37
-בית משותף, ניהול........................................ (61+) 42
-בעלות .............................................. (2) 33, (11+) 34
-הערת אזהרה ............................................. (126+) 48
-זיקת הנאה........................................ (5) 33, (92+) 46
-זכות קדימה ................................................. (99+) 46
-משכנתה........................................... (4) 33, (85+) 45
-שכירות............................................. (3) 33, (78+) 45

מכר דירות......................................................... 57, 62, 73
-אי התאמה ..................................(4+) 57, (תוספת) 61
-דירה............................................................... (1) 57
-מפרט ................................................. (2+) 62, (5) 58

הגנת הדייר .................................................................... 80
-דמי מפתח ................................................... (74+) 85
-דייר מוגן...................................................... (21+) 82
-פינוי................................................ (91) 87, (99) 88

תכנון ובנייה................................................................... 90
-הגדרות........................................................... (1) 90
-היטל השבחה.......................................... (196א) 125
-ועדה מחוזית.................................................. (7+) 94
-ועדה מקומית............................................. (13+) 100
-תוכנית מיתאר ארצית................................. (49+) 107
-תוכנית מיתאר מחוזית................................ (55+) 108
-תוכנית מיתאר מקומית............................... (61+) 108

מיסוי מקרקעין............................................................ 128
-הגדרות......................................................... (1) 128
-מס רכישה, הטלה.......................................... (9) 130
-מס שבח, הטלה............................................ (6+) 130
--פטור דירת מגורים מזכה.............................(49) 139

עונשין ......................................................................... 140
-הונאה...................................................... (439+) 140
-מרמה........................................................ (414) 140

רישוי עסקים ............................................................... 142
-רישיון עסק.................................................. (4+) 142

מקרקעי ישראל ........................................................... 169
-איסור העברת בעלות..................................... (1) 169

הוצאה לפועל .............................................................. 172
-כונס נכסים................................................ (53+) 172
-עיקול מקרקעין.......................................... (62+) 173

שמאי מקרקעין............................................................ 177
-ייחוד העיסוק והתואר...................................(13) 177

ירושה.......................................................................... 178
-מנהל עזבון.............................................. (78+) 178`;

/**
 * Valid page numbers per chapter based on detailed table of contents
 */
const VALID_PAGES: Record<number, number[]> = {
  1: [1, 2, 10, 11, 12, 15, 17], // פרק 1: מתווכים
  2: [18, 20, 22, 24, 25], // פרק 2: הגנת הצרכן
  3: [26, 27, 28, 29, 30, 31], // פרק 3: חוזים
  4: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 54], // פרק 4: מקרקעין
  5: [57, 58, 59, 60, 61, 62, 73, 74, 75, 76, 79], // פרק 5: מכר
  6: [80, 82, 83, 84, 85, 86, 87, 88, 89], // פרק 6: הגנת הדייר
  7: [90, 91, 92, 93, 94, 95, 96, 98, 99, 100, 102, 103, 104, 105, 107, 108, 119, 121, 122, 123, 125], // פרק 7: תכנון ובנייה
  8: [128, 129, 130, 134, 137, 138, 139], // פרק 8: מיסוי מקרקעין
  9: [140, 141], // פרק 9: עונשין
  10: [142, 143, 144, 145, 149, 150, 151], // פרק 10: רישוי עסקים
  11: [169, 171], // פרק 11: מקרקעי ישראל
  12: [172, 173, 174, 175, 176], // פרק 12: הוצאה לפועל
  13: [177], // פרק 13: שמאי מקרקעין
  14: [178, 179], // פרק 14: ירושה
};

/**
 * Validate and correct page number to use only valid pages from detailed index
 */
function validatePageNumber(chapter: number, page: number): number {
  const validPages = VALID_PAGES[chapter];
  if (!validPages) return page; // If chapter not in list, return as-is
  
  // If page is valid, return it
  if (validPages.includes(page)) return page;
  
  // Find closest valid page
  const closest = validPages.reduce((prev, curr) => {
    return Math.abs(curr - page) < Math.abs(prev - page) ? curr : prev;
  });
  
  return closest;
}

/**
 * Convert old format reference to new format
 * Old: "חלק 1 - פרק X: [שם הפרק], עמוד Y"
 * New: "[שם החוק/התקנה] – סעיף X מופיע בעמ' Y בקובץ." or "[שם החוק/התקנה] מתחילות בעמ' Y בקובץ."
 */
export function convertOldFormatToNew(reference: string, questionText?: string): string {
  // Check if it's already new format
  if (reference.includes('מופיע בעמ') || reference.includes('מתחילות בעמ')) {
    return reference;
  }
  
  // Extract chapter and page from old format
  const match = reference.match(/פרק (\d+):\s*([^,]+),\s*עמוד (\d+)/);
  if (!match) {
    return reference; // Can't convert, return as-is
  }
  
  const chapter = parseInt(match[1], 10);
  const chapterName = match[2].trim();
  const page = parseInt(match[3], 10);
  
  // Map chapter to law/regulation name with full name including year
  const chapterToLaw: Record<number, { name: string; startPage: number }> = {
    1: { name: 'חוק המתווכים במקרקעין, התשנ"ו–1996', startPage: 1 },
    2: { name: 'חוק הגנת הצרכן, התשמ"א–1981', startPage: 18 },
    3: { name: 'חוק החוזים (חלק כללי), התשל"ג–1973', startPage: 26 },
    4: { name: 'חוק המקרקעין, התשכ"ט–1969', startPage: 33 },
    5: { name: 'חוק המכר (דירות), התשל"ג–1973', startPage: 57 },
    6: { name: 'חוק הגנת הדייר [נוסח משולב], התשל"ב–1972', startPage: 80 },
    7: { name: 'חוק התכנון והבנייה, התשכ"ה–1965', startPage: 90 },
    8: { name: 'חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג–1963', startPage: 128 },
    9: { name: 'חוק העונשין, התשל"ז–1977', startPage: 140 },
    10: { name: 'חוק רישוי עסקים, התשכ"ח–1968', startPage: 142 },
    11: { name: 'חוק מקרקעי ישראל, התש"ך–1960', startPage: 169 },
    12: { name: 'חוק ההוצאה לפועל, התשכ"ז–1967', startPage: 172 },
    13: { name: 'חוק שמאי מקרקעין, התשס"א–2001', startPage: 177 },
    14: { name: 'חוק הירושה, התשכ"ה–1965', startPage: 178 },
  };
  
  const lawInfo = chapterToLaw[chapter];
  if (!lawInfo) {
    return reference; // Can't convert, return as-is
  }
  
  // Helper function to clean the reference text - remove instruction text and page numbers
  // Keep only the law/section reference
  const appendReferenceNote = (ref: string) => {
    // Remove "מופיע בקובץ" or "מתחילות בקובץ" and any page numbers
    ref = ref.replace(/מופיע בעמ['\s]?\s*\d+ בקובץ\./g, '');
    ref = ref.replace(/מתחילות בעמ['\s]?\s*\d+ בקובץ\./g, '');
    ref = ref.replace(/מופיע בקובץ\./g, '');
    ref = ref.replace(/מתחילות בקובץ\./g, '');
    
    // Remove instruction text if present
    ref = ref.replace(/העמוד שצוין הוא נקודת הפתיחה של החוק או הסעיף בקובץ\./g, '');
    ref = ref.replace(/כדי למצוא את התשובה המלאה, עיינו גם בעמודים הבאים עד לסיום אותו סעיף\./g, '');
    ref = ref.replace(/\(עמ['\s]?\s*\d+\)/g, '');
    
    // Clean up any extra spaces and trailing dots
    ref = ref.trim().replace(/\.\s*\./g, '.').replace(/\s+/g, ' ');
    
    return ref;
  };
  
  // Try to determine section number from question text
  // If it's the start page of the law, use "מתחילות"
  if (page === lawInfo.startPage) {
    return appendReferenceNote(`${lawInfo.name}`);
  }
  
  // Try to find section number from question text if provided
  if (questionText) {
    const text = questionText.toLowerCase();
    
    // Common section patterns for each chapter
    if (chapter === 1) {
      // פרק 1: מתווכים
      if (text.includes('מידע מהותי') || (text.includes('חובת המתווה') && text.includes('לגלות')) ||
          (text.includes('חובת המתווך') && text.includes('לגלות'))) {
        // גילוי מידע מהותי מופיע בסעיף 8(ב)
        return appendReferenceNote(`חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב)`);
      }
      if (text.includes('דמי תיווך') || text.includes('סעיף 9')) {
        return appendReferenceNote(`חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9`);
      }
      if (text.includes('עניין אישי') || text.includes('גילוי') || text.includes('סעיף 10')) {
        return appendReferenceNote(`חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 10`);
      }
      if (text.includes('הזמנה בכתב')) {
        return appendReferenceNote(`תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997`);
      }
    } else if (chapter === 2) {
      // פרק 2: הגנת הצרכן
      if (text.includes('חוזה אחיד') || text.includes('סעיף 4א')) {
        return appendReferenceNote(`חוק הגנת הצרכן – סעיף 4א`);
      }
      if (text.includes('ביטול מכר') || text.includes('סעיף 32')) {
        return appendReferenceNote(`חוק הגנת הצרכן – סעיף 32`);
      }
    } else if (chapter === 3) {
      // פרק 3: חוזים
      if (text.includes('הפרת חוזה') || text.includes('תרופות') || text.includes('סעיף 1')) {
        return appendReferenceNote(`חוק החוזים (תרופות בשל הפרת חוזה) – סעיף 1`);
      }
      if (text.includes('ביטול חוזה') || text.includes('סעיף 13')) {
        return appendReferenceNote(`חוק החוזים (חלק כללי) – סעיף 13`);
      }
    } else if (chapter === 4) {
      // פרק 4: מקרקעין
      if (text.includes('בית משותף')) {
        if (text.includes('ניהול') || text.includes('סעיף 61')) {
          return appendReferenceNote(`חוק המקרקעין – סעיף 61`);
        }
        if (text.includes('סעיף 42')) {
          return appendReferenceNote(`חוק המקרקעין – סעיף 42`);
        }
        return appendReferenceNote(`חוק המקרקעין`);
      }
    } else if (chapter === 5) {
      // פרק 5: מכר
      if (text.includes('אחריות') && (text.includes('קבלן') || text.includes('מסירת דירה חדשה'))) {
        // אחריות קבלן מופיע בסעיף 4ב
        return appendReferenceNote(`חוק המכר (דירות), התשל"ג–1973 – סעיף 4ב`);
      }
      if (text.includes('אי התאמה') || text.includes('סעיף 4')) {
        return appendReferenceNote(`חוק המכר (דירות), התשל"ג–1973 – סעיף 4`);
      }
      if (text.includes('מפרט') || text.includes('סעיף 2')) {
        return appendReferenceNote(`חוק המכר (דירות), התשל"ג–1973 – סעיף 2`);
      }
    } else if (chapter === 6) {
      // פרק 6: הגנת הדייר
      if (text.includes('דמי מפתח') || text.includes('סעיף 74')) {
        return appendReferenceNote(`חוק הגנת הדייר – סעיף 74`);
      }
      if (text.includes('דייר מוגן') || text.includes('סעיף 21')) {
        return appendReferenceNote(`חוק הגנת הדייר – סעיף 21`);
      }
    } else if (chapter === 7) {
      // פרק 7: תכנון ובנייה
      if (text.includes('תוכנית מיתאר מקומית') || text.includes('סעיף 61')) {
        return appendReferenceNote(`חוק התכנון והבנייה – סעיף 61`);
      }
      if (text.includes('היטל השבחה') || text.includes('סעיף 196א')) {
        return appendReferenceNote(`חוק התכנון והבנייה – סעיף 196א`);
      }
      if (text.includes('עבודות') || text.includes('בנייה') || text.includes('מחייבות') || text.includes('היתר')) {
        // Building and construction works that require permits
        if (text.includes('קבלת היתר') || text.includes('מחייבות')) {
          return appendReferenceNote(`חוק התכנון והבנייה – סעיף 113`);
        }
        if (text.includes('עבודות') && text.includes('בנייה')) {
          return appendReferenceNote(`חוק התכנון והבנייה – סעיף 76`);
        }
        return appendReferenceNote(`חוק התכנון והבנייה – סעיף 113`);
      }
    } else if (chapter === 8) {
      // פרק 8: מיסוי מקרקעין
      if (text.includes('מס רכישה') || text.includes('סעיף 9')) {
        return appendReferenceNote(`חוק מיסוי מקרקעין (שבח ורכישה) – סעיף 9`);
      }
      if (text.includes('פטור דירת מגורים') || text.includes('סעיף 49')) {
        return appendReferenceNote(`חוק מיסוי מקרקעין (שבח ורכישה) – סעיף 49`);
      }
    }
  }
  
  // For other cases, return a generic format without section number
  return appendReferenceNote(`${lawInfo.name}`);
}

/**
 * Extract and validate reference format
 */
function validateReference(reference: string, questionText?: string): string {
  // Helper function to clean the reference text - remove instruction text and page numbers
  // Keep only the law/section reference
  const appendReferenceNote = (ref: string) => {
    // Remove "מופיע בקובץ" or "מתחילות בקובץ" and any page numbers
    ref = ref.replace(/מופיע בעמ['\s]?\s*\d+ בקובץ\./g, '');
    ref = ref.replace(/מתחילות בעמ['\s]?\s*\d+ בקובץ\./g, '');
    ref = ref.replace(/מופיע בקובץ\./g, '');
    ref = ref.replace(/מתחילות בקובץ\./g, '');
    
    // Remove instruction text if present
    ref = ref.replace(/העמוד שצוין הוא נקודת הפתיחה של החוק או הסעיף בקובץ\./g, '');
    ref = ref.replace(/כדי למצוא את התשובה המלאה, עיינו גם בעמודים הבאים עד לסיום אותו סעיף\./g, '');
    ref = ref.replace(/\(עמ['\s]?\s*\d+\)/g, '');
    
    // Clean up any extra spaces and trailing dots
    ref = ref.trim().replace(/\.\s*\./g, '.').replace(/\s+/g, ' ');
    
    return ref;
  };
  
  // Check if it's the new format (with "מופיע בעמ" or "מתחילות בעמ")
  if (reference.includes('מופיע בעמ') || reference.includes('מתחילות בעמ')) {
    // Extract page number from new format
    const pageMatch = reference.match(/עמ['\s]?\s*(\d+)/);
    let validatedRef = reference;
    
    if (pageMatch) {
      const page = parseInt(pageMatch[1], 10);
      // Try to determine chapter from law name
      let chapter = 1; // default
      if (reference.includes('מתווכים')) chapter = 1;
      else if (reference.includes('הגנת הצרכן')) chapter = 2;
      else if (reference.includes('חוזים')) chapter = 3;
      else if (reference.includes('מקרקעין') && !reference.includes('מיסוי') && !reference.includes('ישראל')) chapter = 4;
      else if (reference.includes('מכר')) chapter = 5;
      else if (reference.includes('הגנת הדייר')) chapter = 6;
      else if (reference.includes('תכנון') || reference.includes('בנייה')) chapter = 7;
      else if (reference.includes('מיסוי מקרקעין')) chapter = 8;
      else if (reference.includes('עונשין')) chapter = 9;
      else if (reference.includes('רישוי עסקים')) chapter = 10;
      else if (reference.includes('מקרקעי ישראל')) chapter = 11;
      else if (reference.includes('הוצאה לפועל')) chapter = 12;
      else if (reference.includes('שמאי')) chapter = 13;
      else if (reference.includes('ירושה')) chapter = 14;
      
      const validPage = validatePageNumber(chapter, page);
      if (validPage !== page) {
        console.warn(`Corrected invalid page ${page} to ${validPage} for chapter ${chapter}`);
        // Replace page number in reference
        validatedRef = reference.replace(/עמ['\s]?\s*\d+/, `עמ' ${validPage}`);
      }
    }
    
    // Ensure the reference has the new note appended
    return appendReferenceNote(validatedRef);
  }
  
  // Old format: Convert to new format
  const oldMatch = reference.match(/פרק (\d+):[^,]+,\s*עמוד (\d+)/);
  if (oldMatch) {
    return convertOldFormatToNew(reference, questionText);
  }
  
  return reference;
}

/**
 * Keyword-based mapping for quick reference lookup
 * This serves as a validation/fallback mechanism
 */
function getBookReferenceByKeywords(questionText: string): string | null {
  const text = questionText.toLowerCase();
  
  // Helper function to clean the reference text - remove instruction text and page numbers
  // Keep only the law/section reference
  const appendReferenceNote = (ref: string) => {
    // Remove "מופיע בקובץ" or "מתחילות בקובץ" and any page numbers
    ref = ref.replace(/מופיע בעמ['\s]?\s*\d+ בקובץ\./g, '');
    ref = ref.replace(/מתחילות בעמ['\s]?\s*\d+ בקובץ\./g, '');
    ref = ref.replace(/מופיע בקובץ\./g, '');
    ref = ref.replace(/מתחילות בקובץ\./g, '');
    
    // Remove instruction text if present
    ref = ref.replace(/העמוד שצוין הוא נקודת הפתיחה של החוק או הסעיף בקובץ\./g, '');
    ref = ref.replace(/כדי למצוא את התשובה המלאה, עיינו גם בעמודים הבאים עד לסיום אותו סעיף\./g, '');
    ref = ref.replace(/\(עמ['\s]?\s*\d+\)/g, '');
    
    // Clean up any extra spaces and trailing dots
    ref = ref.trim().replace(/\.\s*\./g, '.').replace(/\s+/g, ' ');
    
    return ref;
  };
  
  // פרק 1: מתווכים
  if (text.includes('דמי תיווך') || text.includes('רישיון מתווך') || text.includes('הזמנה בכתב') || 
      text.includes('ביטול הזמנה') || text.includes('ביטול הסכם') || text.includes('ביטול תיווך') ||
      text.includes('מתווך') || text.includes('תיווך') || text.includes('אגרות') || 
      text.includes('עניין אישי') || text.includes('גילוי') || text.includes('מידע מהותי') ||
      text.includes('חובת המתווה') || text.includes('חובת המתווך') || text.includes('לגלות')) {
    if (text.includes('ביטול הזמנה') || text.includes('ביטול הסכם') || text.includes('ביטול תיווך') ||
        (text.includes('ביטול') && (text.includes('הזמנה') || text.includes('תיווך') || text.includes('הסכם')))) {
      // ביטול הזמנה מופיע בחוק המתווכים - סעיף 9 עמוד 2, סעיף 10 עמוד 3
      // אבל עמוד 3 לא מופיע במפורט, אז נשתמש בעמוד 2 או 15 (תקנות הזמנה בכתב)
      if (text.includes('תנאים') || text.includes('לא עמד')) {
        return 'חלק 1 - פרק 1: מתווכים, עמוד 2';
      }
      return 'חלק 1 - פרק 1: מתווכים, עמוד 15';
    }
    if (text.includes('מידע מהותי') || (text.includes('חובת המתווה') && text.includes('לגלות')) ||
        (text.includes('חובת המתווך') && text.includes('לגלות'))) {
      // גילוי מידע מהותי מופיע בסעיף 8(ב) בחוק המתווכים - עמוד 3
      return 'חלק 1 - פרק 1: מתווכים, עמוד 3';
    }
    if (text.includes('עניין אישי') || text.includes('גילוי')) {
      // עניין אישי מופיע בסעיף 10 בחוק המתווכים - עמוד 2
      return 'חלק 1 - פרק 1: מתווכים, עמוד 2';
    }
    if (text.includes('דמי תיווך')) return 'חלק 1 - פרק 1: מתווכים, עמוד 2';
    if (text.includes('הזמנה בכתב')) return 'חלק 1 - פרק 1: מתווכים, עמוד 15';
    if (text.includes('רישיון') || text.includes('בחינה')) return 'חלק 1 - פרק 1: מתווכים, עמוד 2';
    return 'חלק 1 - פרק 1: מתווכים, עמוד 1';
  }
  
  // פרק 2: הגנת הצרכן
  if (text.includes('חוזה אחיד') || text.includes('הטעיה') || text.includes('ביטול מכר') || 
      text.includes('הגנת הצרכן') || text.includes('פיצויים') && text.includes('צרכן')) {
    if (text.includes('חוזה אחיד')) return 'חלק 1 - פרק 2: הגנת הצרכן, עמוד 20';
    if (text.includes('ביטול מכר')) return 'חלק 1 - פרק 2: הגנת הצרכן, עמוד 24';
    if (text.includes('פיצויים')) return 'חלק 1 - פרק 2: הגנת הצרכן, עמוד 22';
    return 'חלק 1 - פרק 2: הגנת הצרכן, עמוד 18';
  }
  
  // פרק 3: חוזים
  if (text.includes('הפרת חוזה') || text.includes('ביטול חוזה') || text.includes('הצעה') || 
      text.includes('קיבול') || text.includes('תרופות') || text.includes('אכיפה') || 
      text.includes('חוזה') && !text.includes('אחיד')) {
    if (text.includes('הפרת חוזה') || text.includes('תרופות')) return 'חלק 1 - פרק 3: חוזים, עמוד 29';
    if (text.includes('ביטול חוזה')) return 'חלק 1 - פרק 3: חוזים, עמוד 27';
    if (text.includes('הצעה') || text.includes('קיבול')) return 'חלק 1 - פרק 3: חוזים, עמוד 26';
    if (text.includes('קיום חוזה')) return 'חלק 1 - פרק 3: חוזים, עמוד 28';
    return 'חלק 1 - פרק 3: חוזים, עמוד 26';
  }
  
  // פרק 4: מקרקעין
  if (text.includes('בית משותף') || text.includes('בעלות') || text.includes('משכנתה') || 
      text.includes('שכירות') || text.includes('זיקת הנאה') || 
      text.includes('זכות קדימה') || text.includes('מקרקעין') && !text.includes('מיסוי') && !text.includes('ישראל')) {
    if (text.includes('בית משותף')) {
      if (text.includes('ניהול')) return 'חלק 1 - פרק 4: מקרקעין, עמוד 42';
      return 'חלק 1 - פרק 4: מקרקעין, עמוד 37';
    }
    if (text.includes('משכנתה')) return 'חלק 1 - פרק 4: מקרקעין, עמוד 45';
    if (text.includes('שכירות')) return 'חלק 1 - פרק 4: מקרקעין, עמוד 45';
    if (text.includes('זיקת הנאה')) return 'חלק 1 - פרק 4: מקרקעין, עמוד 46';
    if (text.includes('זכות קדימה')) return 'חלק 1 - פרק 4: מקרקעין, עמוד 46';
    if (text.includes('בעלות')) return 'חלק 1 - פרק 4: מקרקעין, עמוד 34';
    return 'חלק 1 - פרק 4: מקרקעין, עמוד 33';
  }
  
  // פרק 5: מכר
  if (text.includes('אחריות') && (text.includes('קבלן') || text.includes('מסירת דירה חדשה'))) {
    // אחריות קבלן מופיע בסעיף 4ב - עמוד 57
    return 'חלק 1 - פרק 5: מכר, עמוד 57';
  }
  if (text.includes('מכר דירות') || text.includes('מפרט') || text.includes('אי התאמה') || 
      text.includes('הבטחת השקעות') || text.includes('דירה') && text.includes('מכר')) {
    if (text.includes('אי התאמה')) return 'חלק 1 - פרק 5: מכר, עמוד 57';
    if (text.includes('מפרט')) return 'חלק 1 - פרק 5: מכר, עמוד 62';
    if (text.includes('הבטחת השקעות')) return 'חלק 1 - פרק 5: מכר, עמוד 73';
    return 'חלק 1 - פרק 5: מכר, עמוד 57';
  }
  
  // פרק 6: הגנת הדייר
  if (text.includes('דמי מפתח') || text.includes('פינוי') || text.includes('דייר מוגן') || 
      text.includes('הגנת הדייר') || text.includes('דייר')) {
    if (text.includes('דמי מפתח')) return 'חלק 1 - פרק 6: הגנת הדייר, עמוד 85';
    if (text.includes('פינוי')) return 'חלק 1 - פרק 6: הגנת הדייר, עמוד 88';
    if (text.includes('דייר מוגן')) return 'חלק 1 - פרק 6: הגנת הדייר, עמוד 82';
    return 'חלק 1 - פרק 6: הגנת הדייר, עמוד 80';
  }
  
  // פרק 7: תכנון ובנייה
  if (text.includes('תוכנית מיתאר') || text.includes('ועדה מקומית') || text.includes('ועדה מחוזית') || 
      text.includes('היטל השבחה') || text.includes('תכנון') || text.includes('בנייה') || text.includes('עבודות') || text.includes('בנייה') || text.includes('היתר בנייה')) {
    if (text.includes('תוכנית מיתאר מקומית')) return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 108';
    if (text.includes('תוכנית מיתאר מחוזית')) return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 108';
    if (text.includes('תוכנית מיתאר ארצית')) return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 107';
    if (text.includes('ועדה מקומית')) return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 100';
    if (text.includes('ועדה מחוזית')) return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 94';
    if (text.includes('היטל השבחה')) return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 125';
    if (text.includes('עבודות') || text.includes('היתר')) {
      // Building and construction works require permits - סעיף 76, סעיף 113
      if (text.includes('קבלת היתר') || text.includes('היתר בנייה') || text.includes('מחייבות') || text.includes('עבודות')) {
        return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 113';
      }
      return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 76';
    }
    return 'חלק 1 - פרק 7: תכנון ובנייה - סעיף 90';
  }
  
  // פרק 8: מיסוי מקרקעין
  if (text.includes('מס רכישה') || text.includes('מס שבח') || text.includes('מיסוי מקרקעין') || 
      text.includes('פטור דירת מגורים') || text.includes('מס') && text.includes('מקרקעין')) {
    if (text.includes('מס רכישה')) return 'חלק 1 - פרק 8: מיסוי מקרקעין, עמוד 130';
    if (text.includes('מס שבח')) return 'חלק 1 - פרק 8: מיסוי מקרקעין, עמוד 130';
    if (text.includes('פטור דירת מגורים')) return 'חלק 1 - פרק 8: מיסוי מקרקעין, עמוד 139';
    return 'חלק 1 - פרק 8: מיסוי מקרקעין, עמוד 128';
  }
  
  // פרק 9: עונשין
  if (text.includes('הונאה') || text.includes('מרמה') || text.includes('זיוף') || 
      text.includes('עונשין') || text.includes('התחזות')) {
    return 'חלק 1 - פרק 9: עונשין, עמוד 140';
  }
  
  // פרק 10: רישוי עסקים
  if (text.includes('רישוי עסקים') || text.includes('רישיון עסק') || text.includes('היתר זמני')) {
    return 'חלק 1 - פרק 10: רישוי עסקים, עמוד 142';
  }
  
  // פרק 11: מקרקעי ישראל
  if (text.includes('מקרקעי ישראל') || text.includes('איסור העברת בעלות')) {
    return 'חלק 1 - פרק 11: מקרקעי ישראל, עמוד 169';
  }
  
  // פרק 12: הוצאה לפועל
  if (text.includes('הוצאה לפועל') || text.includes('עיקול') || text.includes('כונס נכסים') || 
      text.includes('מימוש משכנתה')) {
    if (text.includes('עיקול')) return 'חלק 1 - פרק 12: הוצאה לפועל, עמוד 173';
    if (text.includes('כונס נכסים')) return 'חלק 1 - פרק 12: הוצאה לפועל, עמוד 172';
    if (text.includes('מימוש משכנתה')) return 'חלק 1 - פרק 12: הוצאה לפועל, עמוד 176';
    return 'חלק 1 - פרק 12: הוצאה לפועל, עמוד 172';
  }
  
  // פרק 13: שמאי מקרקעין
  if (text.includes('שמאי') || text.includes('שומת מקרקעין')) {
    return 'חלק 1 - פרק 13: שמאי מקרקעין, עמוד 177';
  }
  
  // פרק 14: ירושה
  if (text.includes('ירושה') || text.includes('מנהל עזבון') || text.includes('עיזבון')) {
    return 'חלק 1 - פרק 14: ירושה, עמוד 178';
  }
  
  return null;
}

/**
 * Validate that a book reference matches the question topic
 * Uses keyword matching to verify alignment between question and reference
 * Returns validation result with suggested corrections if needed
 */
export function validateReferenceMatchesQuestion(
  questionText: string,
  bookReference: string
): { isValid: boolean; reason?: string; suggestedReference?: string } {
  if (!bookReference || bookReference.trim() === '') {
    return { isValid: false, reason: 'Reference is empty' };
  }

  const questionLower = questionText.toLowerCase();
  const referenceLower = bookReference.toLowerCase();

  // Reject references to excluded regulation - only "תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997" on pages 15-17
  // Note: "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997" on page 15 is allowed
  // Note: "תקנות המתווכים במקרקעין (פעולות שיווק), התשס"ה–2004" on page 17 is allowed
  // Also reject: "חוק המתווכים במקרקעין, התשנ"ו–1996" on page 15 (the law is on pages 1-2, not 15)
  if (referenceLower.includes('תקנות המתווכים במקרקעין (נושאי בחינה)') || 
      (referenceLower.includes('נושאי בחינה') && referenceLower.includes('תשנ"ז'))) {
    // Check if it's on pages 15-17
    if (referenceLower.includes('עמ\' 15') || referenceLower.includes('עמ\' 16') || 
        referenceLower.includes('עמ\' 17') || referenceLower.includes('עמ\' 15-17') ||
        referenceLower.includes('עמוד 15') || referenceLower.includes('עמוד 16') ||
        referenceLower.includes('עמוד 17') || referenceLower.includes('עמודים 15-17')) {
      // Try to get a suggested reference
      const keywordReference = getBookReferenceByKeywords(questionText);
      if (keywordReference) {
        const suggestedRef = convertOldFormatToNew(keywordReference, questionText);
        return { 
          isValid: false, 
          reason: 'Reference to excluded regulation (תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997 on pages 15-17)', 
          suggestedReference: suggestedRef 
        };
      }
      return { 
        isValid: false, 
        reason: 'Reference to excluded regulation (תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997 on pages 15-17)' 
      };
    }
  }
  
  // Reject references to "חוק המתווכים במקרקעין, התשנ"ו–1996" on page 15 (the law is on pages 1-2, not 15)
  if (referenceLower.includes('חוק המתווכים במקרקעין') && referenceLower.includes('תשנ"ו') && 
      (referenceLower.includes('עמ\' 15') || referenceLower.includes('עמוד 15'))) {
    // Try to get a suggested reference (should be pages 1-2)
    const keywordReference = getBookReferenceByKeywords(questionText);
    if (keywordReference) {
      const suggestedRef = convertOldFormatToNew(keywordReference, questionText);
      // If the suggested reference is still page 15, correct it to page 1 or 2
      if (suggestedRef.includes('עמוד 15') || suggestedRef.includes('עמ\' 15')) {
        // Extract the section number if present
        const sectionMatch = referenceLower.match(/סעיף\s*(\d+[א-ת]?)/);
        if (sectionMatch) {
          const section = sectionMatch[1];
          return {
            isValid: false,
            reason: 'חוק המתווכים במקרקעין, התשנ"ו–1996 is on pages 1-2, not page 15',
            suggestedReference: `חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף ${section} מופיע בעמ' 1 בקובץ.`
          };
        }
        return {
          isValid: false,
          reason: 'חוק המתווכים במקרקעין, התשנ"ו–1996 is on pages 1-2, not page 15',
          suggestedReference: `חוק המתווכים במקרקעין, התשנ"ו–1996 מופיע בעמ' 1 בקובץ.`
        };
      }
      return { 
        isValid: false, 
        reason: 'חוק המתווכים במקרקעין, התשנ"ו–1996 is on pages 1-2, not page 15', 
        suggestedReference: suggestedRef 
      };
    }
    return { 
      isValid: false, 
      reason: 'חוק המתווכים במקרקעין, התשנ"ו–1996 is on pages 1-2, not page 15' 
    };
  }

  // Extract key topics from the question
  const questionTopics: string[] = [];
  
  // Check for specific law names mentioned in questions
  if (questionLower.includes('חוק החוזים') || questionLower.includes('הפרת חוזה') || (questionLower.includes('סנקציות') && questionLower.includes('חוזה'))) {
    questionTopics.push('חוק החוזים', 'חוזה');
  }
  if (questionLower.includes('חוק המקרקעין') || (questionLower.includes('מקרקעין') && !questionLower.includes('מיסוי'))) {
    questionTopics.push('חוק המקרקעין', 'מקרקעין');
  }
  if (questionLower.includes('חוק התכנון') || questionLower.includes('חוק תכנון ובנייה') || (questionLower.includes('תכנון') && questionLower.includes('בנייה'))) {
    questionTopics.push('תכנון ובנייה', 'חוק התכנון');
  }
  if (questionLower.includes('חוק הירושה') || questionLower.includes('מנהל עזבון') || questionLower.includes('עזבון')) {
    questionTopics.push('חוק הירושה', 'ירושה');
  }
  if (questionLower.includes('חוק שמאי') || questionLower.includes('שמאי מקרקעין')) {
    questionTopics.push('חוק שמאי', 'שמאי');
  }
  if (questionLower.includes('חוק מיסוי') || questionLower.includes('מיסוי מקרקעין') || questionLower.includes('מס רכישה') || questionLower.includes('מס שבח')) {
    questionTopics.push('מיסוי מקרקעין', 'חוק מיסוי');
  }
  if (questionLower.includes('חוק ההוצאה לפועל') || questionLower.includes('עיקול מקרקעין') || (questionLower.includes('עיקול') && questionLower.includes('מקרקעין'))) {
    questionTopics.push('חוק ההוצאה לפועל', 'עיקול');
  }
  if (questionLower.includes('חוק רישוי עסקים') || questionLower.includes('רישיון עסק')) {
    questionTopics.push('חוק רישוי עסקים', 'רישוי עסקים');
  }
  
  // Check for specific legal topics
  if (questionLower.includes('מידע מהותי') || questionLower.includes('חובת המתווה') || questionLower.includes('חובת המתווך') || questionLower.includes('לגלות')) {
    questionTopics.push('מידע מהותי', 'גילוי', 'חובת המתווך', 'חוק המתווכים');
  }
  if (questionLower.includes('ביטול הזמנה') || questionLower.includes('ביטול הסכם') || questionLower.includes('ביטול תיווך')) {
    questionTopics.push('ביטול', 'הזמנה', 'חוק המתווכים', 'חוק החוזים');
  }
  if (questionLower.includes('אחריות') && (questionLower.includes('קבלן') || questionLower.includes('מסירת דירה חדשה'))) {
    questionTopics.push('אחריות קבלן', 'סעיף 4ב', 'חוק המכר');
  }
  if (questionLower.includes('חוזה אחיד')) {
    questionTopics.push('חוזה אחיד', 'הגנת הצרכן', 'חוק החוזים האחידים', 'חוק הגנת הצרכן');
  }
  // Questions about brokers can reference multiple laws
  if (questionLower.includes('מתווך') || questionLower.includes('תיווך')) {
    questionTopics.push('חוק המתווכים', 'חוק הגנת הצרכן', 'חוק החוזים');
  }
  // Questions about misrepresentation/deception by brokers
  if (questionLower.includes('הטעיה') || questionLower.includes('הונאה') || (questionLower.includes('מתווך') && (questionLower.includes('הטעיה') || questionLower.includes('הונאה')))) {
    questionTopics.push('חוק הגנת הצרכן', 'חוק המתווכים');
  }
  // Questions about contracts
  if (questionLower.includes('חוזה') && !questionLower.includes('אחיד')) {
    questionTopics.push('חוק החוזים', 'חוק המתווכים');
  }
  // Questions about real estate
  if (questionLower.includes('מקרקעין') && !questionLower.includes('מיסוי')) {
    questionTopics.push('חוק המקרקעין', 'מקרקעי ישראל');
  }
  // Questions about planning and building
  if (questionLower.includes('היטל') || questionLower.includes('השבחה')) {
    questionTopics.push('חוק התכנון והבנייה', 'תכנון ובנייה');
  }
  if (questionLower.includes('בית משותף')) {
    questionTopics.push('בית משותף', 'מקרקעין');
  }
  if (questionLower.includes('מכר') && questionLower.includes('דירות')) {
    questionTopics.push('מכר דירות', 'חוק המכר');
  }
  if (questionLower.includes('דייר מוגן') || questionLower.includes('הגנת הדייר') || questionLower.includes('דייר רשום') || questionLower.includes('דמי מפתח')) {
    questionTopics.push('הגנת הדייר', 'דייר מוגן', 'חוק הגנת הדייר');
  }
  // Questions about "מקרקעי ישראל" (Israel Lands)
  if (questionLower.includes('מקרקעי ישראל') || questionLower.includes('חוק יסוד: מקרקעי ישראל')) {
    questionTopics.push('מקרקעי ישראל', 'חוק יסוד: מקרקעי ישראל', 'חוק מקרקעי ישראל');
  }
  if (questionLower.includes('תכנון') || questionLower.includes('בנייה')) {
    if (!questionTopics.includes('תכנון ובנייה')) {
      questionTopics.push('תכנון ובנייה');
    }
  }
  if (questionLower.includes('מיסוי מקרקעין') || questionLower.includes('מס רכישה') || questionLower.includes('מס שבח')) {
    if (!questionTopics.includes('מיסוי מקרקעין')) {
      questionTopics.push('מיסוי מקרקעין');
    }
  }

  // If no specific topics found, use keyword-based matching
  if (questionTopics.length === 0) {
    const keywordReference = getBookReferenceByKeywords(questionText);
    if (keywordReference) {
      // Convert to new format if needed
      const suggestedRef = convertOldFormatToNew(keywordReference, questionText);
      // Check if current reference is similar
      const suggestedLower = suggestedRef.toLowerCase();
      if (referenceLower.includes('מתווכים') && suggestedLower.includes('מתווכים')) {
        return { isValid: true };
      }
      if (referenceLower.includes('מכר') && suggestedLower.includes('מכר')) {
        return { isValid: true };
      }
      if (referenceLower.includes('הגנת הצרכן') && suggestedLower.includes('הגנת הצרכן')) {
        return { isValid: true };
      }
      // If reference doesn't match expected topic, suggest correction
      return { isValid: false, reason: 'Reference does not match question topic', suggestedReference: suggestedRef };
    }
    // If we can't determine topic, assume valid but log warning
    return { isValid: true };
  }

  // Check if reference contains relevant keywords for the question topics
  let hasMatchingTopic = false;
  for (const topic of questionTopics) {
    const topicLower = topic.toLowerCase();
    // Direct match
    if (referenceLower.includes(topicLower)) {
      hasMatchingTopic = true;
      break;
    }
    // Check for individual words in multi-word topics
    const topicWords = topicLower.split(/\s+/);
    if (topicWords.length > 1) {
      let allWordsMatch = true;
      for (const word of topicWords) {
        if (word.length > 2 && !referenceLower.includes(word)) {
          allWordsMatch = false;
          break;
        }
      }
      if (allWordsMatch) {
        hasMatchingTopic = true;
        break;
      }
    }
  }

  // Also check for specific law name patterns that should match
  if (questionTopics.includes('תכנון ובנייה') || questionTopics.includes('חוק התכנון')) {
    if (referenceLower.includes('תכנון') && referenceLower.includes('בנייה')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('מיסוי מקרקעין')) {
    if (referenceLower.includes('מיסוי') && referenceLower.includes('מקרקעין')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('חוק המתווכים')) {
    if (referenceLower.includes('מתווכים') || referenceLower.includes('תיווך')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('חוק הגנת הצרכן') || questionTopics.includes('הגנת הצרכן')) {
    if (referenceLower.includes('הגנת הצרכן')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('חוק החוזים') || questionTopics.includes('חוזה')) {
    if (referenceLower.includes('חוק החוזים') || referenceLower.includes('חוזה')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('חוק החוזים האחידים')) {
    if (referenceLower.includes('חוזים אחידים') || referenceLower.includes('חוזה אחיד')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('חוק המקרקעין') || questionTopics.includes('מקרקעין')) {
    if (referenceLower.includes('חוק המקרקעין') || referenceLower.includes('מקרקעין')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('מקרקעי ישראל') || questionTopics.includes('חוק יסוד: מקרקעי ישראל') || questionTopics.includes('חוק מקרקעי ישראל')) {
    if (referenceLower.includes('מקרקעי ישראל') || referenceLower.includes('חוק יסוד: מקרקעי ישראל')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('הגנת הדייר') || questionTopics.includes('חוק הגנת הדייר') || questionTopics.includes('דייר מוגן')) {
    if (referenceLower.includes('הגנת הדייר') || referenceLower.includes('חוק הגנת הדייר')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('מידע מהותי') || questionTopics.includes('גילוי') || questionTopics.includes('חובת המתווך')) {
    if (referenceLower.includes('מתווכים') && (referenceLower.includes('סעיף 8') || referenceLower.includes('סעיף 10'))) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('אחריות קבלן') || questionTopics.includes('סעיף 4ב')) {
    if (referenceLower.includes('מכר') && (referenceLower.includes('סעיף 4ב') || referenceLower.includes('סעיף 4'))) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('חוזה אחיד') || questionTopics.includes('הגנת הצרכן')) {
    if (referenceLower.includes('הגנת הצרכן') || referenceLower.includes('חוזה אחיד')) {
      hasMatchingTopic = true;
    }
  }
  if (questionTopics.includes('מכר דירות') || questionTopics.includes('חוק המכר')) {
    if (referenceLower.includes('מכר') && referenceLower.includes('דירות')) {
      hasMatchingTopic = true;
    }
  }
  
  // Check for common law name patterns in the reference
  // If question mentions a law name, check if reference contains it (with variations)
  const lawNamePatterns: { [key: string]: string[] } = {
    'חוק החוזים': ['חוק החוזים', 'חוזה'],
    'חוק המקרקעין': ['חוק המקרקעין', 'מקרקעין'],
    'חוק התכנון': ['חוק התכנון', 'תכנון', 'בנייה'],
    'חוק הירושה': ['חוק הירושה', 'ירושה'],
    'חוק שמאי': ['חוק שמאי', 'שמאי'],
    'חוק מיסוי': ['חוק מיסוי', 'מיסוי מקרקעין', 'שבח', 'רכישה'],
    'חוק ההוצאה לפועל': ['חוק ההוצאה לפועל', 'הוצאה לפועל', 'עיקול'],
    'חוק רישוי עסקים': ['חוק רישוי עסקים', 'רישוי עסקים']
  };
  
  for (const [lawName, patterns] of Object.entries(lawNamePatterns)) {
    if (questionLower.includes(lawName.toLowerCase())) {
      for (const pattern of patterns) {
        if (referenceLower.includes(pattern.toLowerCase())) {
          hasMatchingTopic = true;
          break;
        }
      }
      if (hasMatchingTopic) break;
    }
  }

  if (!hasMatchingTopic) {
    // Try to get a suggested reference
    const keywordReference = getBookReferenceByKeywords(questionText);
    if (keywordReference) {
      const suggestedRef = convertOldFormatToNew(keywordReference, questionText);
      return { isValid: false, reason: 'Reference does not match question topic', suggestedReference: suggestedRef };
    }
    return { isValid: false, reason: 'Reference does not match question topic' };
  }

  return { isValid: true };
}

/**
 * Cache for retrieve-blocks results (keyed by question + docId + maxBlocks)
 * Cache expires after 5 minutes
 */
const retrieveBlocksCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Circuit breaker for retrieve-blocks
 * Stops calling the service if failures exceed threshold
 */
let circuitBreakerState: {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
} = {
  failures: 0,
  lastFailureTime: 0,
  isOpen: false,
};
const CIRCUIT_BREAKER_THRESHOLD = 5; // Open circuit after 5 consecutive failures
const CIRCUIT_BREAKER_RESET_TIME = 10 * 1000; // Reset after 10 seconds (reduced from 30s for faster recovery)

/**
 * Helper function to invoke retrieve-blocks with retry logic, caching, and circuit breaker
 */
export async function invokeRetrieveBlocks(
  question: string,
  docId: string = 'part1',
  maxBlocks: number = 8,
  sectionFilter?: string,
  maxAttempts: number = 2 // Reduced from 3 to 2 to reduce calls
): Promise<any> {
  // Check circuit breaker
  const now = Date.now();
  if (circuitBreakerState.isOpen) {
    if (now - circuitBreakerState.lastFailureTime < CIRCUIT_BREAKER_RESET_TIME) {
      throw new Error('Circuit breaker is open: retrieve-blocks service is temporarily unavailable');
    } else {
      // Reset circuit breaker after reset time
      circuitBreakerState = {
        failures: 0,
        lastFailureTime: 0,
        isOpen: false,
      };
    }
  }

  // Check cache
  const cacheKey = `${question}|${docId}|${maxBlocks}|${sectionFilter || ''}`;
  const cached = retrieveBlocksCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }

  const { supabase } = await import('./authService');
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke('retrieve-blocks', {
        body: {
          question,
          doc_id: docId,
          max_blocks: maxBlocks,
          section_filter: sectionFilter,
        },
      });

      if (error) {
        // Check if it's a retryable error (network, timeout, 5xx, 429)
        const errorStatus = (error as any)?.status || (error as any)?.statusCode || (error as any)?.code;
        const errorMessage = error.message || String(error);
        const isRetryable = 
          errorStatus === 429 || // Rate limit
          errorStatus >= 500 || // Server error
          errorStatus === 408 || // Timeout
          errorMessage.includes('timeout') ||
          errorMessage.includes('network') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('503') ||
          errorMessage.includes('502') ||
          errorMessage.includes('504');

        // Update circuit breaker on failure
        circuitBreakerState.failures++;
        circuitBreakerState.lastFailureTime = now;
        if (circuitBreakerState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
          circuitBreakerState.isOpen = true;
          console.error('Circuit breaker opened: retrieve-blocks service is failing repeatedly');
        }

        if (isRetryable && attempt < maxAttempts) {
          console.warn(`retrieve-blocks failed (attempt ${attempt}/${maxAttempts}), retrying...`, {
            error,
            status: errorStatus,
            message: errorMessage
          });
          // Exponential backoff: 1s, 2s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
          continue;
        }
        
        lastError = new Error(`Failed to retrieve blocks: ${errorMessage} (Status: ${errorStatus || 'N/A'})`);
        if (attempt >= maxAttempts) {
          throw lastError;
        }
        continue;
      }

      // Success - reset circuit breaker and cache result
      circuitBreakerState.failures = 0;
      circuitBreakerState.isOpen = false;

      if (!data || !data.blocks || data.blocks.length === 0) {
        // Empty result is not retryable, but cache it to avoid repeated calls
        const emptyResult = { blocks: [] };
        retrieveBlocksCache.set(cacheKey, { data: emptyResult, timestamp: now });
        return emptyResult;
      }

      // Cache successful result
      retrieveBlocksCache.set(cacheKey, { data, timestamp: now });
      
      // Clean up old cache entries (keep cache size reasonable)
      if (retrieveBlocksCache.size > 100) {
        const oldestKey = Array.from(retrieveBlocksCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
        if (oldestKey) {
          retrieveBlocksCache.delete(oldestKey);
        }
      }

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Update circuit breaker on exception
      circuitBreakerState.failures++;
      circuitBreakerState.lastFailureTime = now;
      if (circuitBreakerState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitBreakerState.isOpen = true;
        console.error('Circuit breaker opened: retrieve-blocks service is failing repeatedly');
      }

      if (attempt >= maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
    }
  }
  
  throw lastError || new Error('Failed to retrieve blocks after all attempts');
}

/**
 * Get book reference using retrieval-first approach
 * Retrieves relevant blocks from database, then generates citation with strict validation
 */
export async function getBookReferenceByRetrieval(
  questionText: string,
  topic?: string
): Promise<string> {
  try {
    // Step 1: Retrieve relevant blocks with retry logic
    const retrieveData = await invokeRetrieveBlocks(
      questionText,
      'part1',
      8,
      topic ? extractSectionFromTopic(topic) : undefined
    );

    if (!retrieveData || !retrieveData.blocks || retrieveData.blocks.length === 0) {
      throw new Error('Failed to retrieve blocks or no blocks found');
    }

    const blocks = retrieveData.blocks;

    // Step 2: Generate citation from retrieved blocks
    const { data: citationData, error: citationError } = await supabase.functions.invoke('generate-citation', {
      body: {
        question: questionText,
        context_blocks: blocks.map((b: any) => ({
          doc_id: b.doc_id,
          page_number: b.page_number,
          block_id: b.block_id,
          text: b.text,
          section_hint: b.section_hint,
        })),
      },
    });

    if (citationError || !citationData) {
      throw new Error('Failed to generate citation');
    }

    // Step 3: Validate and return citation
    if (citationData.reference && citationData.reference !== 'Insufficient context.') {
      return citationData.reference;
    }

    throw new Error('Citation validation failed or insufficient context');
  } catch (error) {
    console.warn('Retrieval-based citation failed:', error);
    throw error;
  }
}

/**
 * Extract section number from topic string (e.g., "סעיף 8(ב)" -> "8(ב)")
 */
function extractSectionFromTopic(topic: string): string | undefined {
  const sectionMatch = topic.match(/סעיף\s*(\d+[א-ת]?[\(\)א-ת]*)/);
  if (sectionMatch) {
    return sectionMatch[1];
  }
  return undefined;
}

/**
 * Get book reference for a question using AI
 * Analyzes the question topic and matches it to the appropriate chapter and page from the table of contents
 */
export async function getBookReferenceByAI(
  questionText: string,
  topic?: string,
  documentContent?: string
): Promise<string> {
  // First try keyword-based matching for quick validation
  const keywordReference = getBookReferenceByKeywords(questionText);
  
  // Try Gemini FIRST (PRIMARY - file search with PDFs works perfectly!)
  try {
    const geminiReference = await getBookReferenceGemini(questionText, topic, documentContent);
      
    // Validate Gemini result against keyword match if available
    if (keywordReference) {
      // Extract chapter numbers from both
      const geminiChapterMatch = geminiReference.match(/פרק (\d+)/);
      const keywordChapterMatch = keywordReference.match(/פרק (\d+)/);
      
      // Check if Gemini returned new format (includes page number or "מופיע בעמ")
      const geminiIsNewFormat = geminiReference.includes('מופיע בעמ') || 
                           geminiReference.includes('מתחילות בעמ') ||
                           geminiReference.includes('עמ\'') ||
                           geminiReference.includes('עמוד');
      const keywordIsNewFormat = keywordReference.includes('מופיע בעמ') || 
                                 keywordReference.includes('מתחילות בעמ') ||
                                 keywordReference.includes('עמ\'') ||
                                 keywordReference.includes('עמוד');
      
      if (geminiIsNewFormat) {
        // Gemini returned new format, validate and use it (prefer Gemini over keyword)
        return validateReference(geminiReference, questionText);
      } else if (keywordIsNewFormat) {
        // Keyword returned new format, use it
        return validateReference(keywordReference, questionText);
      } else {
        // Both are old format, check chapters
        // If Gemini reference doesn't have chapter info but keyword does, still prefer Gemini if it looks valid
        if (!geminiChapterMatch && keywordChapterMatch) {
          // Gemini doesn't have chapter, but has law name - prefer Gemini if it's a valid law reference
          if (geminiReference.includes('חוק') || geminiReference.includes('תקנות')) {
            return convertOldFormatToNew(geminiReference, questionText);
          }
        }
        if (geminiChapterMatch && keywordChapterMatch && geminiChapterMatch[1] === keywordChapterMatch[1]) {
          // Chapters match, convert to new format
          return convertOldFormatToNew(geminiReference, questionText);
        } else if (keywordChapterMatch) {
          // Chapters don't match, but if Gemini reference looks valid (has law name), prefer it
          if (geminiReference.includes('חוק') || geminiReference.includes('תקנות')) {
            return convertOldFormatToNew(geminiReference, questionText);
          }
          // Otherwise prefer keyword-based (more reliable)
          console.warn('Gemini reference chapter mismatch, using keyword-based reference:', {
            gemini: geminiReference,
            keyword: keywordReference
          });
          return convertOldFormatToNew(keywordReference, questionText);
        }
      }
    }
    
    // Validate Gemini reference before returning (convert if old format)
    return validateReference(geminiReference, questionText);
  } catch (error) {
    console.warn('Gemini book reference failed, trying OpenAI as fallback:', (error as Error).message);
    // Fallback to OpenAI
    try {
      const aiReference = await getBookReferenceOpenAI(questionText, topic, documentContent);
      
      // Validate AI result against keyword match if available
      if (keywordReference) {
        // Extract chapter numbers from both
        const aiChapterMatch = aiReference.match(/פרק (\d+)/);
        const keywordChapterMatch = keywordReference.match(/פרק (\d+)/);
        
        // Check if AI returned new format (includes page number or "מופיע בעמ")
        const aiIsNewFormat = aiReference.includes('מופיע בעמ') || 
                             aiReference.includes('מתחילות בעמ') ||
                             aiReference.includes('עמ\'') ||
                             aiReference.includes('עמוד');
        const keywordIsNewFormat = keywordReference.includes('מופיע בעמ') || 
                                   keywordReference.includes('מתחילות בעמ') ||
                                   keywordReference.includes('עמ\'') ||
                                   keywordReference.includes('עמוד');
        
        if (aiIsNewFormat) {
          // AI returned new format, validate and use it (prefer AI over keyword)
          return validateReference(aiReference, questionText);
        } else if (keywordIsNewFormat) {
          // Keyword returned new format, use it
          return validateReference(keywordReference, questionText);
        } else {
          // Both are old format, check chapters
          // If AI reference doesn't have chapter info but keyword does, still prefer AI if it looks valid
          if (!aiChapterMatch && keywordChapterMatch) {
            // AI doesn't have chapter, but has law name - prefer AI if it's a valid law reference
            if (aiReference.includes('חוק') || aiReference.includes('תקנות')) {
              return convertOldFormatToNew(aiReference, questionText);
            }
          }
          if (aiChapterMatch && keywordChapterMatch && aiChapterMatch[1] === keywordChapterMatch[1]) {
            // Chapters match, convert to new format
            return convertOldFormatToNew(aiReference, questionText);
          } else if (keywordChapterMatch) {
            // Chapters don't match, but if AI reference looks valid (has law name), prefer it
            if (aiReference.includes('חוק') || aiReference.includes('תקנות')) {
              return convertOldFormatToNew(aiReference, questionText);
            }
            // Otherwise prefer keyword-based (more reliable)
            console.warn('AI reference chapter mismatch, using keyword-based reference:', {
              ai: aiReference,
              keyword: keywordReference
            });
            return convertOldFormatToNew(keywordReference, questionText);
          }
        }
      }
      
      // Validate AI reference before returning (convert if old format)
      return validateReference(aiReference, questionText);
    } catch (openaiError) {
      console.error('Both Gemini and OpenAI failed for book reference:', {
        gemini: (error as Error).message,
        openai: (openaiError as Error).message
      });
      // Final fallback to keyword-based or default
      if (keywordReference) {
        // Convert to new format if it's old format
        if (keywordReference.includes('מופיע בעמ') || keywordReference.includes('מתחילות בעמ')) {
          return keywordReference;
        } else {
          return convertOldFormatToNew(keywordReference, questionText);
        }
      }
      return 'חלק 1';
    }
  }
}

/**
 * Get book reference using OpenAI
 */
async function getBookReferenceOpenAI(
  questionText: string,
  topic?: string,
  documentContent?: string
): Promise<string> {
  // Import OpenAI dynamically
  const OpenAI = (await import('openai')).default;
  const { getOpenAIKey } = await import('./apiKeysService');
  
  // Get API key
  let apiKey: string | null = null;
  try {
    apiKey = await getOpenAIKey();
  } catch (error) {
    // Fallback to direct env read
    apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENAI_API_KEY) || null;
  }
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  
  const openai = new OpenAI({ 
    apiKey,
    dangerouslyAllowBrowser: true 
  });
  
  // Try to use Assistants API with both PDFs (optional - gracefully skip if PDFs not available)
  let pdfAttachment: any = null;
  try {
    pdfAttachment = await attachBookPdfsToOpenAI(openai);
  } catch (error: any) {
    // If PDFs are not found in storage or vectorStores API is unavailable, skip PDF attachment and use chat completions
    const isNotFoundError = error?.message?.includes('Object not found') || 
                           error?.message?.includes('not found') ||
                           error?.code === '404' ||
                           error?.status === 404 ||
                           error?.statusCode === 404;
    
    const isVectorStoresError = error?.message?.includes('vectorStores') || 
                                error?.message?.includes('vectorStores API is not available');
    
    if (isNotFoundError) {
      console.warn('getBookReferenceOpenAI: PDFs not found in storage, skipping PDF attachment and using chat completions');
    } else if (isVectorStoresError) {
      console.warn('getBookReferenceOpenAI: VectorStores API unavailable, skipping PDF attachment and using chat completions:', error?.message);
    } else {
      console.warn('getBookReferenceOpenAI: Failed to attach PDFs to OpenAI for book reference, falling back to chat completions:', error?.message || error);
    }
    // Continue with chat completions - don't throw error
  }
  
  // Skip Assistants API - use fast chat completions instead
  if (false && pdfAttachment && pdfAttachment.vectorStoreIds && pdfAttachment.vectorStoreIds.length > 0) {
    try {
      
      // Create an Assistant with file_search tool
      const assistant = await openai.beta.assistants.create({
        model: 'gpt-4o-mini',
        name: 'Book Reference Assistant',
        instructions: `אתה מומחה בניתוח שאלות למבחן הרישוי למתווכי מקרקעין בישראל. 

תפקידך: כאשר מקבלים שאלה, חפש בקבצי ה-PDF המצורפים (חלק 1 וחלק 2) את הנושא המשפטי הרלוונטי, הבן את השאלה בהקשר של הספר, ומצא את ההפניה המדויקת (שם החוק/התקנה המלא עם שנה, מספר הסעיף המדויק, ומספר העמוד).

חשוב מאוד: כל ההפניות חייבות להיות לחלק 1 של הספר בלבד, גם אם הנושא מופיע גם בחלק 2. השתמש בחלק 2 רק להבנת ההקשר, אך תמיד החזר הפניה לחלק 1.

השתמש בכלי file_search כדי לחפש בקבצי ה-PDF את הנושא מהשאלה. קרא את הטקסט הרלוונטי בקבצים כדי למצוא את הסעיף המדויק שמתייחס לנושא השאלה.

פורמט התשובה:
- אם יש סעיף ספציפי: "[שם החוק/התקנה המלא עם שנה] – סעיף X"
- אם יש סעיף עם אות: "[שם החוק/התקנה המלא עם שנה] – סעיף Xא/ב/ג"
- אם יש תת-סעיף: "[שם החוק/התקנה המלא עם שנה] – סעיף X(תת-סעיף)"
- אם זה תחילת חוק/תקנה: "[שם החוק/התקנה המלא עם שנה]"

חשוב:
- חפש בקבצי ה-PDF את הנושא מהשאלה
- מצא את הסעיף המדויק שמתייחס לנושא
- קרא את הטקסט של הסעיף כדי לוודא שהוא רלוונטי
- השתמש במספר העמוד המדויק מהקובץ (חלק 1)
- תמיד כלול את שם החוק המלא עם השנה
- תמיד החזר הפניה לחלק 1 בלבד

החזר רק את ההפניה בפורמט הנדרש, ללא טקסט נוסף.`,
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: {
            vector_store_ids: pdfAttachment.vectorStoreIds
          }
        }
      });
      
      if (!assistant || !assistant.id) {
        throw new Error('Failed to create assistant: assistant.id is undefined');
      }
      
      // Create a Thread
      const thread = await openai.beta.threads.create();
      
      if (!thread || !thread.id) {
        throw new Error('Failed to create thread: thread.id is undefined');
      }
      
      // Store thread ID in a const to ensure it doesn't get lost
      const threadId = thread.id;
      const assistantId = assistant.id;
      
      // Add user message with the question
      const userMessage = await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `שאלה: ${questionText}

חפש בקבצי ה-PDF המצורפים (חלק 1 וחלק 2) את הנושא המשפטי מהשאלה ומצא את ההפניה המדויקת (שם החוק/התקנה המלא עם שנה, מספר הסעיף, ומספר העמוד).

חשוב מאוד: כל ההפניות חייבות להיות לחלק 1 של הספר בלבד, גם אם הנושא מופיע גם בחלק 2. השתמש בחלק 2 רק להבנת ההקשר, אך תמיד החזר הפניה לחלק 1.`
      });
      
      // Run the Assistant
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId
      });
      
      if (!run || !run.id) {
        throw new Error('Failed to create run: run.id is undefined');
      }
      
      // Store run ID in a const to ensure it doesn't get lost
      const runId = run.id;
      
      // Wait for the run to complete
      let runStatus = run.status;
      while (runStatus === 'queued' || runStatus === 'in_progress') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Use stored threadId and runId to avoid any potential issues
        if (!threadId || !runId) {
          throw new Error(`Missing IDs: threadId=${threadId}, runId=${runId}`);
        }
        const runInfo = await openai.beta.threads.runs.retrieve(threadId, runId);
        runStatus = runInfo.status;
        if (runStatus === 'failed' || runStatus === 'cancelled' || runStatus === 'expired') {
          throw new Error(`Run ${runStatus}`);
        }
      }
      
      // Retrieve the response
      const messages = await openai.beta.threads.messages.list(threadId);
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
      
      if (!assistantMessage || !assistantMessage.content || assistantMessage.content.length === 0) {
        throw new Error('No response from assistant');
      }
      
      // Extract text from response
      const content = assistantMessage.content[0];
      let responseText = '';
      if (content.type === 'text') {
        responseText = content.text.value;
      } else {
        throw new Error('Unexpected response type from assistant');
      }
      
      // Clean up: delete assistant and PDFs
      try {
        await openai.beta.assistants.del(assistant.id);
        await pdfAttachment.cleanup();
      } catch (cleanupError) {
        console.warn('Failed to clean up OpenAI resources:', cleanupError);
      }
      
      // Validate and return the response
      const trimmedContent = responseText.trim();
      if (!trimmedContent) {
        throw new Error('Empty response from assistant');
      }
      
      // Validate format - prefer new format
      if (trimmedContent.includes('מופיע בעמ') || trimmedContent.includes('מתחילות בעמ')) {
        return trimmedContent;
      }
      
      // Try to extract new format reference if wrapped in quotes or other text
      const newFormatMatch = trimmedContent.match(/(חוק|תקנות)[^–]+–\s*סעיף\s+[^.]*מופיע בעמ['\s]?\s*\d+[^.]*בקובץ/);
      if (newFormatMatch) {
        return newFormatMatch[0];
      }
      
      // Try to extract "מתחילות בעמ" format
      const startsAtMatch = trimmedContent.match(/(חוק|תקנות)[^.]*מתחילות בעמ['\s]?\s*\d+[^.]*בקובץ/);
      if (startsAtMatch) {
        return startsAtMatch[0];
      }
      
      // If old format is returned, log warning but return it
      if (trimmedContent.startsWith('חלק 1 - פרק')) {
        console.warn('AI returned old format reference, should use new format:', trimmedContent);
        return trimmedContent;
      }
      
      // Try old format extraction as last resort
      const oldMatch = trimmedContent.match(/חלק 1 - פרק \d+: [^,]+,\s*עמוד \d+/);
      if (oldMatch) {
        console.warn('AI returned old format reference, should use new format:', oldMatch[0]);
        return oldMatch[0];
      }
      
      return trimmedContent;
    } catch (assistantsError) {
      console.warn('Failed to use Assistants API, falling back to chat completions:', assistantsError);
      // Fall through to chat completions fallback
    }
  }
  
  // Fallback to chat completions if Assistants API fails or PDF is not available
  const prompt = `אתה מומחה בניתוח שאלות למבחן הרישוי למתווכי מקרקעין בישראל. משימתך היא לקבוע את ההפניה המדויקת לספר "חלק 1" על בסיס נושא השאלה.

⚠️ CRITICAL: כל הפניה MUST כלול מספר סעיף! אם אין סעיף ספציפי בשאלה, תמצא את הסעיף הרלוונטי בקובץ.

השאלה:
${questionText}

${topic ? `נושא השאלה: ${topic}` : ''}

תוכן העניינים של הספר "חלק 1":
---
${TABLE_OF_CONTENTS}
---

הספרים מצורפים כקבצי PDF לניתוח זה.

⚠️ CRITICAL REQUIREMENT: כל ההפניות MUST לכלול סעיף ספציפי (סעיף X)!

חשוב מאוד: כל ההפניות חייבות להיות לחלק 1 של הספר בלבד, גם אם הנושא מופיע גם בחלק 2.

הוראות מפורטות לקביעת ההפניה:
1. קרא את השאלה בעיון וזהה את הנושא המשפטי המרכזי
2. חפש בקבצי ה-PDF (חלק 1 וחלק 2) את הנושא הספציפי מהשאלה
   - חפש מילות מפתח מהשאלה (למשל: "גילוי", "מידע מהותי", "עניין אישי", "דמי תיווך", "הזמנה בכתב", "אחריות", "קבלן", "מסירת דירה", "עבודות בנייה", "היתר")
   - מצא את הסעיף המדויק שמתייחס לנושא זה (למשל: "סעיף 8", "סעיף 8(ב)", "סעיף 9", "סעיף 10", "סעיף 4א", "סעיף 4ב", "סעיף 113", "סעיף 76")
   - אם השאלה על "מידע מהותי" או "חובת המתווה לגלות", חפש "סעיף 8" או "סעיף 8(ב)"
   - אם השאלה על "אחריות קבלן" או "מסירת דירה חדשה", חפש "סעיף 4ב" או "אחריות"
   - אם השאלה על "עבודות בנייה" או "עבודות המחייבות היתר", חפש "סעיף 113" או "סעיף 76"
   - קרא את הטקסט של הסעיף כדי לוודא שהוא מתייחס לנושא מהשאלה
   - מצא את מספר העמוד המדויק שבו מופיע הסעיף (העמוד מופיע בתחילת כל עמוד בתוכן)
   - חשוב: תמיד החזר הפניה לחלק 1 בלבד, גם אם הנושא מופיע גם בחלק 2
3. מצא את שם החוק/התקנה המדויק (למשל: "חוק המתווכים במקרקעין" או "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב)")
4. ודא שמספר הסעיף שמצאת בקובץ ה-PDF תואם לנושא השאלה
5. השתמש במספר העמוד המדויק שמופיע בקובץ ה-PDF (חלק 1)
6. החזר הפניה בפורמט מדויק:
   - ⚠️ MUST INCLUDE SECTION NUMBER: "[שם החוק/התקנה] – סעיף X"
   - NEVER return just the law name without a section!
   - דוגמאות (CORRECT):
     * "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9"
     * "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997 – סעיף 1"
     * "חוק הגנת הצרכן, התשמ"א–1981 – סעיף 4א"
     * "חוק התכנון והבנייה, התשכ"ה–1965 – סעיף 113"

מיפוי נושאים לפרקים:
- מתווכים, דמי תיווך, רישיון מתווך, הזמנה בכתב → פרק 1: מתווכים
- הגנת הצרכן, חוזה אחיד, הטעיה, ביטול מכר → פרק 2: הגנת הצרכן
- חוזים, הפרת חוזה, ביטול חוזה, תרופות, הצעה וקיבול → פרק 3: חוזים
- מקרקעין, בית משותף, בעלות, משכנתה, שכירות, זיקת הנאה → פרק 4: מקרקעין
- מכר דירות, מפרט, אי התאמה, הבטחת השקעות → פרק 5: מכר
- הגנת הדייר, דמי מפתח, פינוי, דייר מוגן → פרק 6: הגנת הדייר
- תכנון ובנייה, תוכנית מיתאר, ועדה מקומית, היטל השבחה → פרק 7: תכנון ובנייה
- מיסוי מקרקעין, מס רכישה, מס שבח, פטור דירת מגורים → פרק 8: מיסוי מקרקעין
- עונשין, הונאה, מרמה, זיוף → פרק 9: עונשין
- רישוי עסקים, רישיון עסק → פרק 10: רישוי עסקים
- מקרקעי ישראל, איסור העברת בעלות → פרק 11: מקרקעי ישראל
- הוצאה לפועל, עיקול, כונס נכסים, מימוש משכנתה → פרק 12: הוצאה לפועל
- שמאי מקרקעין, שומת מקרקעין → פרק 13: שמאי מקרקעין
- ירושה, מנהל עזבון, עיזבון → פרק 14: ירושה

דוגמאות מדויקות לפורמט:
- שאלה על "דמי תיווך" → חפש "דמי תיווך" או "סעיף 9" בתוכן הספר, מצא את העמוד → "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9 מופיע בעמ' 2 בקובץ."
- שאלה על "גילוי מידע מהותי" או "חובת המתווה לגלות" → חפש "מידע מהותי" או "סעיף 8" בתוכן הספר, מצא את העמוד → "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב) מופיע בעמ' 3 בקובץ."
- שאלה על "עניין אישי" או "גילוי עניין אישי" → חפש "עניין אישי" או "סעיף 10" בתוכן הספר, מצא את העמוד → "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 10 מופיע בעמ' 2 בקובץ."
- שאלה על "אחריות קבלן" או "מסירת דירה חדשה" → חפש "אחריות" או "סעיף 4ב" בתוכן הספר, מצא את העמוד → "חוק המכר (דירות), התשל"ג–1973 – סעיף 4ב מופיע בעמ' 57 בקובץ."
- שאלה על "ביטול הזמנה" → חפש "ביטול" או "סעיף 9" או "סעיף 10" בתוכן הספר → "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9 מופיע בעמ' 2 בקובץ." או "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997 מתחילות בעמ' 15 בקובץ."
- שאלה על "חוזה אחיד" → חפש "חוזה אחיד" או "סעיף 4א" בתוכן הספר → "חוק הגנת הצרכן, התשמ"א–1981 – סעיף 4א מופיע בעמ' 20 בקובץ."
- שאלה על "הפרת חוזה" → חפש "הפרת חוזה" או "תרופות" או "סעיף 1" בתוכן הספר → "חוק החוזים (תרופות בשל הפרת חוזה), התשל"א–1970 – סעיף 1 מופיע בעמ' 29 בקובץ."
- שאלה על "בית משותף" → חפש "בית משותף" או "סעיף 42" בתוכן הספר → "חוק המקרקעין, התשכ"ט–1969 – סעיף 42 מופיע בעמ' 37 בקובץ."
- שאלה על "מס רכישה" → חפש "מס רכישה" או "סעיף 9" בתוכן הספר → "חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג–1963 – סעיף 9 מופיע בעמ' 130 בקובץ."
- שאלה על "דמי מפתח" → חפש "דמי מפתח" או "סעיף 74" בתוכן הספר → "חוק הגנת הדייר [נוסח משולב], התשל"ב–1972 – סעיף 74 מופיע בעמ' 85 בקובץ."
- שאלה על "תוכנית מיתאר מקומית" → חפש "תוכנית מיתאר מקומית" או "סעיף 61" בתוכן הספר → "חוק התכנון והבנייה, התשכ"ה–1965 – סעיף 61 מופיע בעמ' 108 בקובץ."

חשוב מאוד:
- חובה! חפש בקבצי ה-PDF (חלק 1 וחלק 2) את המילים מהשאלה כדי למצוא את הסעיף המדויק
- אל תמציא מספרי סעיפים! מצא אותם בקבצי ה-PDF
- קרא את הטקסט של הסעיף בקבצים כדי לוודא שהוא מתייחס לנושא מהשאלה
- מספר העמוד מופיע בקובץ ה-PDF (חלק 1) - השתמש במספר העמוד המדויק
- אם מצאת "סעיף 8(ב)" בעמוד 3 בקובץ, החזר: "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב) מופיע בעמ' 3 בקובץ."
- אם מצאת "סעיף 10" בעמוד 2 בקובץ, החזר: "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 10 מופיע בעמ' 2 בקובץ."
- אם מצאת "סעיף 9" בעמוד 2 בקובץ, החזר: "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9 מופיע בעמ' 2 בקובץ."
- חשוב: תמיד כלול את שם החוק המלא עם השנה (למשל: "חוק המתווכים במקרקעין, התשנ"ו–1996")
- כל מספר עמוד חייב להיות מדויק כפי שמופיע בספר (חלק 1)
- כל מספר סעיף חייב להיות מדויק - אל תמציא מספרים!
- השתמש רק בעמודים שמופיעים בתוכן העניינים המפורט! אל תשתמש בעמודים שלא מופיעים במפורט
- תמיד החזר הפניה לחלק 1 בלבד, גם אם הנושא מופיע גם בחלק 2

עמודים תקפים בפרק 1: מתווכים:
- עמוד 1: חוק המתווכים במקרקעין
- עמוד 2: (סעיפים בחוק המתווכים)
- עמוד 10: תקנות המתווכים, פרק א' כללי, פרק ב' סדרי הבחינה
- עמוד 11: פרק ג' רשיון ואגרות
- עמוד 12: תוספת
- עמוד 15: תקנות הזמנה בכתב, תקנות נושאי בחינה
- עמוד 17: תקנות פעולות שיווק

אל תשתמש בעמודים 3, 4, 5, 6, 7, 8, 9, 13, 14, 16 בפרק 1 כי הם לא מופיעים במפורט!

אם נושא מופיע בסעיף שמפנה לעמוד שלא מופיע במפורט, השתמש בעמוד הקרוב ביותר שכן מופיע, או בעמוד תחילת החוק/התקנות הרלוונטיות.

חשוב מאוד: החזר את ההפניה בפורמט החדש בלבד:
- "[שם החוק/התקנה המלא עם שנה] – סעיף X" (אם יש סעיף ספציפי)
- "[שם החוק/התקנה המלא עם שנה] – סעיף X(תת-סעיף)" (אם יש תת-סעיף)
- "[שם החוק/התקנה המלא עם שנה]" (אם זה תחילת חוק/תקנה)
- דוגמה: "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב)"

אל תחזיר בפורמט הישן "חלק 1 - פרק X: [שם הפרק], עמוד Y"!

החזר רק את ההפניה בפורמט הנדרש, ללא טקסט נוסף.`;

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    instructions: 'אתה מומחה בניתוח שאלות משפטיות וקביעת הפניות לספרים. אתה תמיד מחזיר את ההפניה בפורמט: "[שם החוק/התקנה המלא עם שנה] – סעיף X" או "[שם החוק/התקנה המלא עם שנה] – סעיף X(תת-סעיף)" או "[שם החוק/התקנה המלא עם שנה]" ללא טקסט נוסף. דוגמה: "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב)"',
    input: prompt,
    temperature: 0.3,
    max_output_tokens: 100,
  });

  const content = response.output_text?.trim();
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Clean the content: remove tabs, normalize whitespace
  let cleanedContent = content
    .replace(/\t/g, ' ')  // Replace tabs with spaces
    .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
    .trim();
  
  // Validate format - prefer new format
  if (cleanedContent.includes('מופיע בעמ') || cleanedContent.includes('מתחילות בעמ')) {
    // New format: "חוק X – סעיף Y מופיע בעמ' Z בקובץ."
    return cleanedContent;
  }
  
  // Try to extract new format reference if wrapped in quotes or other text
  const newFormatMatch = cleanedContent.match(/(חוק|תקנות)[^–]+–\s*סעיף\s+[^.]*מופיע בעמ['\s]?\s*\d+[^.]*בקובץ/);
  if (newFormatMatch) {
    return newFormatMatch[0];
  }
  
  // Try to extract "מתחילות בעמ" format
  const startsAtMatch = cleanedContent.match(/(חוק|תקנות)[^.]*מתחילות בעמ['\s]?\s*\d+[^.]*בקובץ/);
  if (startsAtMatch) {
    return startsAtMatch[0];
  }
  
  // CRITICAL: Validate that reference includes section number
  const hasSectionNumber = /סעיף\s+\d+[א-ת]?|\(סעיף\s+\d+/.test(cleanedContent);
  
  if (!hasSectionNumber && (cleanedContent.includes('חוק') || cleanedContent.includes('תקנות'))) {
    console.warn(`⚠️ Reference missing section number for: "${questionText.substring(0, 50)}..."`);
    console.warn(`  Returned: "${cleanedContent}"`);
    
    // Try keyword-based fallback with conversion
    try {
      const keywordRef = getBookReferenceByKeywords(questionText);
      if (keywordRef) {
        const convertedRef = convertOldFormatToNew(keywordRef, questionText);
        console.log(`  Fallback to keyword: "${convertedRef}"`);
        return convertedRef;
      }
    } catch (error) {
      console.warn('  Keyword fallback failed');
    }
  }
  
  // If old format is returned, convert it
  if (cleanedContent.startsWith('חלק 1 - פרק')) {
    console.warn('⚠️ Converting old format:', cleanedContent);
    return convertOldFormatToNew(cleanedContent, questionText);
  }

  // Try old format extraction and convert
  const oldMatch = cleanedContent.match(/חלק 1 - פרק \d+: [^,]+,\s*עמוד \d+/);
  if (oldMatch) {
    console.warn('⚠️ Converting old format:', oldMatch[0]);
    return convertOldFormatToNew(oldMatch[0], questionText);
  }
  
  // Accept any reference that contains law name with section number
  if (cleanedContent && hasSectionNumber && (cleanedContent.includes('חוק') || cleanedContent.includes('תקנות'))) {
    return cleanedContent;
  }
  
  // If no section number found, it's likely inaccurate - log and attempt keyword fallback
  if (!hasSectionNumber) {
    console.warn(`⚠️ Final attempt: no section number in: "${cleanedContent}"`);
    try {
      const keywordRef = getBookReferenceByKeywords(questionText);
      if (keywordRef) {
        return convertOldFormatToNew(keywordRef, questionText);
      }
    } catch (error) {
      // continue
    }
  }

  return cleanedContent;
}

/**
 * Get book reference using Gemini
 */
async function getBookReferenceGemini(
  questionText: string,
  topic?: string,
  documentContent?: string
): Promise<string> {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const { getGeminiKey } = await import('./apiKeysService');
  
  // Get API key
  let apiKey: string | null = null;
  try {
    apiKey = await getGeminiKey();
  } catch (error) {
    // Fallback to direct env read
    apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) || null;
  }
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Try to attach both PDFs to Gemini
  let pdfAttachment: any = null;
  let contents: any = null;
  let prompt: string;
  
  try {
    pdfAttachment = await attachBookPdfsToGemini(ai);
  } catch (error: any) {
    // If PDFs are not found in storage, silently skip PDF attachment and use chat completions
    const isNotFoundError = error?.message?.includes('Object not found') || 
                           error?.message?.includes('not found') ||
                           error?.message?.includes('not found in storage') ||
                           error?.code === '404' ||
                           error?.status === 404 ||
                           error?.statusCode === 404 ||
                           error?.statusCode === 400;
    
    if (isNotFoundError) {
      console.warn('PDFs not found in storage, skipping PDF attachment and using chat completions');
    } else {
      console.warn('Failed to attach PDFs to Gemini for book reference, falling back to chat completions:', error);
    }
  }
  
  if (pdfAttachment && pdfAttachment.parts && pdfAttachment.parts.length > 0) {
    // Use PDFs with text prompt
    prompt = `אתה מומחה בניתוח שאלות למבחן הרישוי למתווכי מקרקעין בישראל.

שאלה: ${questionText}
${topic ? `\nנושא השאלה: ${topic}` : ''}

קבצי ה-PDF המלאים של הספר (חלק 1 וחלק 2) מצורפים לך. חובה מוחלטת: אתה חייב לקרוא את התוכן בפועל בקבצי ה-PDF כדי למצוא את ההפניה המדויקת. אל תמציא הפניות! כל הפניה חייבת להיות מבוססת על תוכן ספציפי שקראת בקבצי ה-PDF.

תהליך חובה למציאת ההפניה המדויקת:
1. קרא את השאלה בעיון וזהה את הנושא המשפטי המרכזי
2. חפש בקבצי ה-PDF (חלק 1 וחלק 2) את המילות מפתח מהשאלה:
   - חפש מילות מפתח ספציפיות מהשאלה (למשל: "גילוי", "מידע מהותי", "עניין אישי", "דמי תיווך", "הזמנה בכתב", "אחריות", "קבלן", "מסירת דירה", "ביטול", "חוזה אחיד", "הטעיה", "הפרת חוזה", "בית משותף", "מס רכישה", "דמי מפתח", "תוכנית מיתאר")
3. מצא את הסעיף המדויק שמתייחס לנושא:
   - חפש את מספר הסעיף המדויק (למשל: "סעיף 8", "סעיף 8(ב)", "סעיף 9", "סעיף 10", "סעיף 4א", "סעיף 4ב")
   - אם השאלה על "מידע מהותי" או "חובת המתווה לגלות", חפש "סעיף 8" או "סעיף 8(ב)" בקבצי ה-PDF
   - אם השאלה על "אחריות קבלן" או "מסירת דירה חדשה", חפש "סעיף 4ב" או "אחריות" בקבצי ה-PDF
   - קרא את הטקסט המלא של הסעיף בקבצי ה-PDF כדי לוודא שהוא מתייחס בדיוק לנושא מהשאלה
4. מצא את מספר העמוד המדויק:
   - מספר העמוד מופיע בקובץ ה-PDF (חלק 1) - השתמש במספר העמוד המדויק כפי שמופיע בקובץ
   - אל תמציא מספרי עמודים! מצא אותם בקובץ בפועל
5. מצא את שם החוק/התקנה המדויק:
   - קרא את שם החוק/התקנה המלא כפי שמופיע בקובץ (למשל: "חוק המתווכים במקרקעין, התשנ"ו–1996" או "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997")
   - ודא שכללת את השנה המלאה (למשל: "התשנ"ו–1996" או "התשנ"ז–1997")

חשוב מאוד: כל ההפניות חייבות להיות לחלק 1 של הספר בלבד, גם אם הנושא מופיע גם בחלק 2. השתמש בחלק 2 רק להבנת ההקשר, אך תמיד החזר הפניה לחלק 1.

פורמט התשובה המדויק:
- אם יש סעיף ספציפי: "[שם החוק/התקנה המלא עם שנה] – סעיף X"
- אם יש סעיף עם אות: "[שם החוק/התקנה המלא עם שנה] – סעיף Xא/ב/ג"
- אם יש תת-סעיף: "[שם החוק/התקנה המלא עם שנה] – סעיף X(תת-סעיף)"
- אם זה תחילת חוק/תקנה: "[שם החוק/התקנה המלא עם שנה]"

דוגמאות מדויקות:
- שאלה על "דמי תיווך" → חפש "דמי תיווך" או "סעיף 9" בקבצי ה-PDF → "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9"
- שאלה על "גילוי מידע מהותי" או "חובת המתווה לגלות" → חפש "מידע מהותי" או "סעיף 8" בקבצי ה-PDF → "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב)"
- שאלה על "עניין אישי" או "גילוי עניין אישי" → חפש "עניין אישי" או "סעיף 10" בקבצי ה-PDF → "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 10"
- שאלה על "אחריות קבלן" או "מסירת דירה חדשה" → חפש "אחריות" או "סעיף 4ב" בקבצי ה-PDF → "חוק המכר (דירות), התשל"ג–1973 – סעיף 4ב"

חשוב מאוד - חובה מוחלטת:
- חובה! חפש בקבצי ה-PDF את המילות מפתח מהשאלה כדי למצוא את הסעיף המדויק
- אל תמציא מספרי סעיפים! מצא אותם בקבצי ה-PDF בפועל
- אל תמציא מספרי עמודים! מצא אותם בקבצי ה-PDF בפועל
- קרא את הטקסט המלא של הסעיף בקבצים כדי לוודא שהוא מתייחס בדיוק לנושא מהשאלה
- מספר העמוד חייב להיות מדויק כפי שמופיע בקובץ ה-PDF (חלק 1)
- מספר הסעיף חייב להיות מדויק כפי שמופיע בקובץ ה-PDF
- שם החוק/התקנה חייב להיות מלא עם השנה כפי שמופיע בקובץ ה-PDF
- תמיד החזר הפניה לחלק 1 בלבד, גם אם הנושא מופיע גם בחלק 2

אל תפנה ל'תקנות המתווכים במקרקעין (נושאי בחינה), התשנ"ז–1997' בעמודים 15-17. תקנות אלו אינן רלוונטיות. השתמש רק בחוקים ותקנות אחרים.

חשוב מאוד: חוק המתווכים במקרקעין, התשנ"ו–1996 מופיע בעמודים 1-2, לא בעמוד 15. אל תפנה לחוק זה בעמוד 15. עמוד 15 מכיל תקנות, לא את החוק עצמו.

החזר רק את ההפניה בפורמט הנדרש, ללא טקסט נוסף.`;

    contents = [
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...pdfAttachment.parts
        ],
      },
    ];
  }

  const referenceSchema = {
    type: Type.OBJECT,
    properties: {
      reference: {
        type: Type.STRING,
        description: 'הפניה לספר בפורמט: "[שם החוק/התקנה המלא עם שנה] – סעיף X" או "[שם החוק/התקנה המלא עם שנה] – סעיף X(תת-סעיף)" או "[שם החוק/התקנה המלא עם שנה]" דוגמאות: "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב)" או "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 9" או "תקנות המתווכים במקרקעין (פרטי הזמנה בכתב), התשנ"ז–1997"'
      }
    },
    required: ['reference']
  };

  // Use contents from PDF attachment if available, otherwise use text-only prompt
  if (!contents) {
    // Use constants defined at the top of the file
    prompt = `אתה מומחה בניתוח שאלות למבחן הרישוי למתווכי מקרקעין בישראל.

שאלה: ${questionText}

הספרים מצורפים כקבצי PDF לניתוח זה.

הבן את השאלה בהקשר של הספר ומצא את ההפניה המדויקת. כל ההפניות חייבות להיות לחלק 1 של הספר בלבד, גם אם הנושא מופיע גם בחלק 2.

פורמט התשובה:
- אם יש סעיף ספציפי: "[שם החוק/התקנה המלא עם שנה] – סעיף X"
- אם יש סעיף עם אות: "[שם החוק/התקנה המלא עם שנה] – סעיף Xא/ב/ג"
- אם יש תת-סעיף: "[שם החוק/התקנה המלא עם שנה] – סעיף X(תת-סעיף)"
- אם זה תחילת חוק/תקנה: "[שם החוק/התקנה המלא עם שנה]"

חשוב:
- הבן את השאלה בהקשר המשפטי
- חפש בקבצי ה-PDF את הנושא מהשאלה
- מצא את הסעיף המדויק שמתייחס לנושא
- קרא את הטקסט של הסעיף כדי לוודא שהוא רלוונטי
- השתמש במספר העמוד המדויק מהקובץ (חלק 1)
- תמיד כלול את שם החוק המלא עם השנה
- תמיד החזר הפניה לחלק 1 בלבד

החזר רק את ההפניה בפורמט הנדרש, ללא טקסט נוסף.`;
    // Format as array for Gemini API
    contents = [{ role: 'user', parts: [{ text: prompt }] }];
  }
  
  // Retry helper for 503 errors
  const retryWithBackoff = async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Log error details for debugging
        console.warn(`Gemini API call failed (attempt ${attempt + 1}/${maxRetries}):`, {
          errorType: error?.constructor?.name,
          errorMessage: error?.message,
          errorStatus: error?.status,
          errorStatusCode: error?.statusCode,
          errorResponse: error?.response,
          errorString: String(error),
          errorKeys: error ? Object.keys(error) : [],
        });
        
        // Check if it's a 503 (overloaded) or 429 (rate limit) error
        const statusCode = error?.status || error?.statusCode || error?.response?.status || error?.response?.statusCode || error?.code;
        const errorMessage = error?.message || String(error) || '';
        const errorString = String(error);
        
        const isRetryableError = 
          statusCode === 503 || 
          statusCode === 429 ||
          errorMessage.includes('503') ||
          errorMessage.includes('Service Unavailable') ||
          errorMessage.includes('overloaded') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('429') ||
          errorString.includes('503') ||
          errorString.includes('Service Unavailable');
        
        if (!isRetryableError || attempt === maxRetries - 1) {
          console.error(`Non-retryable error or max retries reached. Throwing error.`, {
            isRetryableError,
            attempt,
            maxRetries,
            statusCode,
            errorMessage,
          });
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = initialDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error('Max retries exceeded');
  };
  
  const response = await retryWithBackoff(async () => {
    return await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: referenceSchema,
      },
    });
  });
  
  // Clean up uploaded files if attached
  if (pdfAttachment) {
    try {
      await pdfAttachment.cleanup();
    } catch (cleanupError) {
      console.warn('Failed to cleanup PDFs from Gemini:', cleanupError);
    }
  }

  let cleanedText = response.text.replace(/^```json/, '').replace(/```$/, '').trim();
  
  // Handle potential JSON parsing errors
  let parsed: any;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (parseError) {
    console.error('Gemini book reference: JSON parse error:', parseError);
    console.error('Gemini book reference: Raw response text:', response.text);
    // Try to extract JSON from response if wrapped in other text
    const jsonMatch = cleanedText.match(/\{[\s\S]*"reference"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        throw new Error(`Failed to parse Gemini response as JSON: ${parseError}`);
      }
    } else {
      throw new Error(`Failed to parse Gemini response as JSON: ${parseError}`);
    }
  }
  
  if (!parsed.reference || typeof parsed.reference !== 'string') {
    console.error('Gemini book reference: No reference in response:', parsed);
    throw new Error('No reference in Gemini response');
  }
  
  // Clean the reference: remove tabs, normalize whitespace
  let cleanedReference = parsed.reference
    .replace(/\t/g, ' ')  // Replace tabs with spaces
    .replace(/\s+/g, ' ')  // Normalize multiple spaces to single space
    .trim();
  
  // Accept both old and new formats, or any reference that contains a law name
  if (cleanedReference && (
    cleanedReference.includes('מופיע בעמ') || 
    cleanedReference.includes('מתחילות בעמ') ||
    cleanedReference.startsWith('חלק 1 - פרק') ||
    cleanedReference.includes('חוק') ||  // Contains "חוק" (law)
    cleanedReference.includes('תקנות') ||  // Contains "תקנות" (regulations)
    cleanedReference.includes('סעיף')  // Contains "סעיף" (section)
  )) {
    return cleanedReference;
  }

  console.error('Gemini book reference: Invalid format:', parsed);
  throw new Error('Invalid reference format from Gemini');
}
