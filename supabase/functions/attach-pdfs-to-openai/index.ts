import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  "Access-Control-Max-Age": "86400",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_API_BASE = "https://api.openai.com/v1";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("❌ Failed to parse JSON:", e);
      return new Response(
        JSON.stringify({ success: false, error: `JSON parse error: ${e}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { fileIds } = body;
    
    if (!OPENAI_API_KEY) {
      console.error("❌ OPENAI_API_KEY not found");
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not set" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid fileIds: ${JSON.stringify(fileIds)}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Create vector store
    const createVsResponse = await fetch(`${OPENAI_API_BASE}/vector_stores`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({ name: `RealEstateLaw-Part1-${Date.now()}` }),
    });

    if (!createVsResponse.ok) {
      const error = await createVsResponse.text();
      console.error("❌ Failed to create vector store:", error);
      return new Response(
        JSON.stringify({ success: false, error: `Create failed: ${error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vs = await createVsResponse.json();
    const vectorStoreId = vs.id;

    // Step 2: Add files to vector store
    const addFilesResponse = await fetch(
      `${OPENAI_API_BASE}/vector_stores/${vectorStoreId}/file_batches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({ file_ids: fileIds }),
      }
    );

    if (!addFilesResponse.ok) {
      const error = await addFilesResponse.text();
      console.error("❌ Failed to add files:", error);
      return new Response(
        JSON.stringify({ success: false, error: `Add files failed: ${error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const batch = await addFilesResponse.json();

    // Return immediately - don't wait for indexing to complete
    // File search will work once indexing completes (usually within 30-60 seconds)
    // This prevents Edge Function timeout (60s limit) and speeds up response
    
    return new Response(
      JSON.stringify({
        success: true,
        vectorStoreId,
        batchStatus: batch.status,
        fileCount: fileIds.length,
        message: "processing"
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${msg}`);

    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
