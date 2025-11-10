import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface RetrieveBlocksRequest {
  question: string;
  doc_id?: string;
  max_blocks?: number;
  section_filter?: string;
}

interface Block {
  doc_id: string;
  page_number: number;
  block_id: string;
  text: string;
  section_hint: string | null;
  score: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body with error handling
    let requestBody: RetrieveBlocksRequest;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { question, doc_id = "part1", max_blocks = 8, section_filter } = requestBody;

    if (!question || question.trim() === "") {
      return new Response(
        JSON.stringify({ error: "question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase configuration:", { 
        hasUrl: !!supabaseUrl, 
        hasKey: !!supabaseKey 
      });
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get OpenAI API key from secrets
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Create question embedding with retry logic
    let queryEmbedding: number[];
    let embeddingAttempts = 0;
    const maxEmbeddingAttempts = 3;
    
    while (embeddingAttempts < maxEmbeddingAttempts) {
      try {
        const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: question,
          }),
        });

        if (!embeddingResponse.ok) {
          const errorText = await embeddingResponse.text();
          console.error(`OpenAI embedding error (attempt ${embeddingAttempts + 1}):`, {
            status: embeddingResponse.status,
            statusText: embeddingResponse.statusText,
            error: errorText
          });
          
          // If it's a rate limit or server error, retry
          if (embeddingResponse.status === 429 || embeddingResponse.status >= 500) {
            embeddingAttempts++;
            if (embeddingAttempts < maxEmbeddingAttempts) {
              // Exponential backoff: 1s, 2s, 4s
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, embeddingAttempts) * 1000));
              continue;
            }
          }
          
          return new Response(
            JSON.stringify({ error: `Failed to create embedding: ${embeddingResponse.status} ${embeddingResponse.statusText}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const embeddingData = await embeddingResponse.json();
        if (!embeddingData.data || !embeddingData.data[0] || !embeddingData.data[0].embedding) {
          throw new Error("Invalid embedding response format");
        }
        
        queryEmbedding = embeddingData.data[0].embedding;
        break; // Success, exit retry loop
      } catch (error) {
        embeddingAttempts++;
        console.error(`Embedding attempt ${embeddingAttempts} failed:`, error);
        
        if (embeddingAttempts >= maxEmbeddingAttempts) {
          return new Response(
            JSON.stringify({ error: `Failed to create embedding after ${maxEmbeddingAttempts} attempts: ${error.message}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, embeddingAttempts) * 1000));
      }
    }

    // Step 2: Run hybrid search (lexical + vector)
    
    // Lexical search using pg_trgm
    // We'll use a simple text search approach since pg_trgm similarity requires raw SQL
    let lexicalQuery = supabase
      .from("legal_blocks")
      .select("doc_id, page_number, block_id, text, section_hint, embedding")
      .eq("doc_id", doc_id)
      .limit(50); // Get more candidates for re-ranking

    if (section_filter) {
      lexicalQuery = lexicalQuery.ilike("section_hint", `%${section_filter}%`);
    }

    const { data: lexicalResults, error: lexicalError } = await lexicalQuery;

    if (lexicalError) {
      console.error("Lexical search error:", lexicalError);
      return new Response(
        JSON.stringify({ error: "Lexical search failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Vector search using pgvector with error handling
    let vectorResults: any[] | null = null;
    try {
      const { data, error: vectorError } = await supabase.rpc("match_blocks", {
        query_embedding: queryEmbedding,
        match_doc_id: doc_id,
        match_threshold: 0.5,
        match_count: 50,
      });

      if (vectorError) {
        console.error("Vector search error:", vectorError);
        // Check if it's a function not found error
        if (vectorError.code === '42883' || vectorError.message?.includes('function') || vectorError.message?.includes('does not exist')) {
          console.warn("match_blocks function not found, continuing with lexical search only");
        } else {
          console.warn("Vector search failed, continuing with lexical search only:", vectorError);
        }
        // Continue with lexical results only if vector search fails
      } else {
        vectorResults = data;
      }
    } catch (rpcError) {
      console.error("RPC call error:", rpcError);
      // Continue with lexical results only
    }

    // Step 3: Combine and re-rank results
    const blockMap = new Map<string, Block & { lexicalScore: number; vectorScore: number }>();

    // Process lexical results
    if (lexicalResults && lexicalResults.length > 0) {
      for (const block of lexicalResults) {
        // Skip blocks without required fields
        if (!block.text || !block.doc_id || block.page_number === undefined || !block.block_id) {
          continue;
        }
        
        // Calculate simple lexical score based on text similarity
        // Using a simple approach: check if question keywords appear in text
        const questionWords = question.toLowerCase().split(/\s+/);
        const textLower = block.text.toLowerCase();
        let lexicalScore = 0;
        for (const word of questionWords) {
          if (textLower.includes(word)) {
            lexicalScore += 1;
          }
        }
        lexicalScore = lexicalScore / questionWords.length; // Normalize to 0-1

        const key = `${block.doc_id}-${block.page_number}-${block.block_id}`;
        blockMap.set(key, {
          doc_id: block.doc_id,
          page_number: block.page_number,
          block_id: block.block_id,
          text: block.text,
          section_hint: block.section_hint,
          score: 0,
          lexicalScore,
          vectorScore: 0,
        });
      }
    }

    // Process vector results
    if (vectorResults && vectorResults.length > 0) {
      for (const block of vectorResults) {
        // Skip blocks without required fields
        if (!block.text || !block.doc_id || block.page_number === undefined || !block.block_id) {
          continue;
        }
        
        const key = `${block.doc_id}-${block.page_number}-${block.block_id}`;
        const existing = blockMap.get(key);
        
        // Calculate vector similarity (1 - distance, since cosine distance is used)
        const vectorScore = 1 - (block.similarity || 0);
        
        if (existing) {
          existing.vectorScore = vectorScore;
        } else {
          blockMap.set(key, {
            doc_id: block.doc_id,
            page_number: block.page_number,
            block_id: block.block_id,
            text: block.text || '',
            section_hint: block.section_hint || null,
            score: 0,
            lexicalScore: 0,
            vectorScore,
          });
        }
      }
    }
    
    // If no blocks found at all, return empty result
    if (blockMap.size === 0) {
      console.warn("No blocks found for query:", { question, doc_id, section_filter });
      return new Response(
        JSON.stringify({ blocks: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Calculate final scores and normalize
    const blocks: Block[] = [];
    for (const block of blockMap.values()) {
      // Normalize scores to 0-1 range
      const lexicalNorm = Math.min(block.lexicalScore, 1);
      const vectorNorm = Math.min(block.vectorScore, 1);
      
      // Hybrid score: 60% lexical + 40% vector
      const finalScore = 0.6 * lexicalNorm + 0.4 * vectorNorm;
      
      blocks.push({
        doc_id: block.doc_id,
        page_number: block.page_number,
        block_id: block.block_id,
        text: block.text,
        section_hint: block.section_hint,
        score: finalScore,
      });
    }

    // Sort by score descending
    blocks.sort((a, b) => b.score - a.score);

    // Step 5: Include contiguous pages from same section
    const selectedPages = new Set<number>();
    const selectedBlocks: Block[] = [];
    const pageToBlocks = new Map<number, Block[]>();

    // Group blocks by page
    for (const block of blocks) {
      if (!pageToBlocks.has(block.page_number)) {
        pageToBlocks.set(block.page_number, []);
      }
      pageToBlocks.get(block.page_number)!.push(block);
    }

    // Select top blocks and include adjacent pages from same section
    for (const block of blocks.slice(0, max_blocks)) {
      if (selectedBlocks.length >= max_blocks) break;
      
      selectedBlocks.push(block);
      selectedPages.add(block.page_number);

      // Include page N+1 from same section if available
      if (block.section_hint) {
        const nextPage = block.page_number + 1;
        const nextPageBlocks = pageToBlocks.get(nextPage);
        if (nextPageBlocks) {
          const sameSectionBlocks = nextPageBlocks.filter(
            b => b.section_hint === block.section_hint
          );
          for (const nextBlock of sameSectionBlocks.slice(0, 2)) {
            if (selectedBlocks.length >= max_blocks) break;
            if (!selectedBlocks.find(b => b.block_id === nextBlock.block_id)) {
              selectedBlocks.push(nextBlock);
            }
          }
        }
      }
    }

    // Return top blocks
    const result = selectedBlocks.slice(0, max_blocks);

    return new Response(
      JSON.stringify({ blocks: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in retrieve-blocks:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

