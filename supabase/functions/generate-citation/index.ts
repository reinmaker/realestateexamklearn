import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.2.1";
import { OpenAI } from "https://deno.land/x/openai@v4.20.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface ContextBlock {
  doc_id: string;
  page_number: number;
  block_id: string;
  text: string;
  section_hint: string | null;
}

interface Citation {
  page: number;
  block_id: string;
  quote: string;
}

interface GenerateCitationRequest {
  question: string;
  context_blocks: ContextBlock[];
}

interface CitationResponse {
  answer: string;
  citations: Citation[];
  confidence: number;
}

interface FinalResponse {
  reference: string;
  citations: Citation[];
  confidence: number;
  section_start_page?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { question, context_blocks }: GenerateCitationRequest = await req.json();

    if (!question || question.trim() === "") {
      return new Response(
        JSON.stringify({ error: "question is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!context_blocks || context_blocks.length === 0) {
      return new Response(
        JSON.stringify({ error: "context_blocks is required and must not be empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get API keys from secrets - try OpenAI first, then Gemini
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    
    if (!openaiApiKey && !geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Neither OPENAI_API_KEY nor GEMINI_API_KEY configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format context blocks with metadata
    const contextStr = context_blocks
      .map((b) => `[page ${b.page_number} | block ${b.block_id}]\n${b.text}`)
      .join("\n\n");

    // Create block map for validation
    const blockMap = new Map<string, ContextBlock>();
    for (const block of context_blocks) {
      const key = `${block.page_number}-${block.block_id}`;
      blockMap.set(key, block);
    }

    // Try OpenAI first, then fallback to Gemini
    let citationResponse: CitationResponse;
    
    if (openaiApiKey) {
      try {
        // Use OpenAI first
        const openai = new OpenAI({ apiKey: openaiApiKey });
        
        const prompt = `אתה מומחה בניתוח שאלות למבחן הרישוי למתווכי מקרקעין בישראל.

חוקים קפדניים:
- השתמש רק ב-CONTEXT שסופק לך
- צטט עמודים רק מהעמודים שמופיעים ב-CONTEXT
- כל ציטוט חייב להיות תת-מחרוזת מדויקת מהטקסט של הבלוק המתאים
- אם התשובה לא נתמכת במלואה על ידי ה-CONTEXT, החזר "Insufficient context." עם citations ריק

פורמט התשובה:
- answer: תשובה קצרה בעברית
- citations: רשימה של ציטוטים, כל אחד עם page, block_id, ו-quote (<= 25 מילים, מילה במילה מהבלוק)
- confidence: 0-1 (1 = בטוח מאוד, 0 = לא בטוח)

QUESTION (Hebrew): "${question}"

CONTEXT (max ${context_blocks.length} blocks):
${contextStr}

Return JSON ONLY with "answer", "citations", "confidence".
Each citation must include: page, block_id, and a <=25-word quote verbatim from that block.
Only cite pages and blocks that are in the CONTEXT above.`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `אתה מומחה בניתוח שאלות למבחן הרישוי למתווכי מקרקעין בישראל. אתה תמיד מחזיר JSON בלבד בפורמט: {"answer": "...", "citations": [{"page": 2, "block_id": "p2-b06", "quote": "..."}], "confidence": 0.9}`
            },
            { role: "user", content: prompt }
          ],
          temperature: 0,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("No response from OpenAI");
        }

        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch (parseError) {
          throw new Error(`Failed to parse OpenAI response: ${parseError}`);
        }

        citationResponse = {
          answer: parsed.answer || "",
          citations: parsed.citations || [],
          confidence: parsed.confidence || 0,
        };
      } catch (openaiError) {
        console.warn("OpenAI failed in generate-citation, falling back to Gemini:", openaiError);
        // Fall through to Gemini
        if (!geminiApiKey) {
          throw new Error("OpenAI failed and GEMINI_API_KEY not configured");
        }
      }
    }
    
    // Fallback to Gemini if OpenAI failed or not configured
    if (!citationResponse && geminiApiKey) {
      // Initialize Gemini
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      
      // Define response schema
      const responseSchema = {
        type: "object",
        properties: {
          answer: { type: "string" },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                page: { type: "number" },
                block_id: { type: "string" },
                quote: { type: "string" },
              },
              required: ["page", "block_id", "quote"],
            },
          },
          confidence: { type: "number" },
        },
        required: ["answer", "citations", "confidence"],
      };
      
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: `אתה מומחה בניתוח שאלות למבחן הרישוי למתווכי מקרקעין בישראל.

חוקים קפדניים:
- השתמש רק ב-CONTEXT שסופק לך
- צטט עמודים רק מהעמודים שמופיעים ב-CONTEXT
- כל ציטוט חייב להיות תת-מחרוזת מדויקת מהטקסט של הבלוק המתאים
- אם התשובה לא נתמכת במלואה על ידי ה-CONTEXT, החזר "Insufficient context." עם citations ריק

פורמט התשובה:
- answer: תשובה קצרה בעברית
- citations: רשימה של ציטוטים, כל אחד עם page, block_id, ו-quote (<= 25 מילים, מילה במילה מהבלוק)
- confidence: 0-1 (1 = בטוח מאוד, 0 = לא בטוח)

החזר JSON בלבד בפורמט:
{
  "answer": "...",
  "citations": [
    {"page": 2, "block_id": "p2-b06", "quote": "...טקסט מצוטט..."}
  ],
  "confidence": 0.9
}`,
      });

      // Create prompt
      const prompt = `QUESTION (Hebrew): "${question}"

CONTEXT (max ${context_blocks.length} blocks):
${contextStr}

Return JSON ONLY with "answer", "citations", "confidence".
Each citation must include: page, block_id, and a <=25-word quote verbatim from that block.
Only cite pages and blocks that are in the CONTEXT above.`;

      // Generate citation
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const responseText = result.response.text();
      
      try {
        // Clean JSON response
        const cleanedText = responseText.replace(/^```json/, "").replace(/```$/, "").trim();
        citationResponse = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error("Gemini JSON parse error:", parseError);
        console.error("Response text:", responseText);
        throw new Error(`Failed to parse Gemini response: ${parseError}`);
      }
    }
    
    // If we still don't have a citation response, throw error
    if (!citationResponse) {
      throw new Error("Failed to generate citation with both OpenAI and Gemini");
    }

    // Server-side validation (must-pass)
    const validatedCitations: Citation[] = [];
    let hasInvalidCitation = false;

    for (const citation of citationResponse.citations || []) {
      const key = `${citation.page}-${citation.block_id}`;
      const block = blockMap.get(key);

      if (!block) {
        console.warn(`Invalid citation: page ${citation.page}, block_id ${citation.block_id} not found in context`);
        hasInvalidCitation = true;
        continue;
      }

      // Validate quote is a substring of block text
      const blockTextLower = block.text.toLowerCase();
      const quoteLower = citation.quote.toLowerCase().trim();

      if (!blockTextLower.includes(quoteLower)) {
        console.warn(`Invalid citation: quote not found in block text`);
        console.warn(`Quote: "${citation.quote}"`);
        console.warn(`Block text preview: "${block.text.substring(0, 200)}"`);
        hasInvalidCitation = true;
        continue;
      }

      // Validate quote length (<= 25 words)
      const wordCount = citation.quote.trim().split(/\s+/).length;
      if (wordCount > 25) {
        console.warn(`Invalid citation: quote too long (${wordCount} words)`);
        hasInvalidCitation = true;
        continue;
      }

      validatedCitations.push({
        page: citation.page,
        block_id: citation.block_id,
        quote: citation.quote,
      });
    }

    // If validation failed or no valid citations, return insufficient context
    if (hasInvalidCitation || validatedCitations.length === 0) {
      return new Response(
        JSON.stringify({
          reference: "Insufficient context.",
          citations: [],
          confidence: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format citation string from validated citations
    // Group citations by page
    const citationsByPage = new Map<number, Citation[]>();
    for (const citation of validatedCitations) {
      if (!citationsByPage.has(citation.page)) {
        citationsByPage.set(citation.page, []);
      }
      citationsByPage.get(citation.page)!.push(citation);
    }

    // Find section hint from first citation
    const firstCitation = validatedCitations[0];
    const firstBlock = blockMap.get(`${firstCitation.page}-${firstCitation.block_id}`);
    const sectionHint = firstBlock?.section_hint || null;

    // Format reference string - keep only the law/section reference
    let reference = "";
    
    if (sectionHint) {
      // Extract law title and section from section_hint if available
      // Format: "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8(ב)"
      reference = sectionHint;
    } else {
      // Fallback format
      reference = `חלק 1`;
    }

    // Find section start page if different from cited page
    let sectionStartPage: number | undefined;
    if (sectionHint && firstBlock) {
      // Try to find the first page of this section
      const sectionPages = context_blocks
        .filter((b) => b.section_hint === sectionHint)
        .map((b) => b.page_number)
        .sort((a, b) => a - b);
      if (sectionPages.length > 0 && sectionPages[0] !== firstCitation.page) {
        sectionStartPage = sectionPages[0];
      }
    }

    const finalResponse: FinalResponse = {
      reference,
      citations: validatedCitations,
      confidence: citationResponse.confidence || 0,
    };

    if (sectionStartPage) {
      finalResponse.section_start_page = sectionStartPage;
    }

    return new Response(
      JSON.stringify(finalResponse),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-citation:", error);
    return new Response(
      JSON.stringify({
        reference: "Insufficient context.",
        citations: [],
        confidence: 0,
        error: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

