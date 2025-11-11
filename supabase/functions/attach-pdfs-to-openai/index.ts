import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { fileIds } = body;
    const apiKey = Deno.env.get("OPENAI_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "OPENAI_API_KEY not set" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid fileIds" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`🔄 Creating vector store for ${fileIds.length} files...`);

    // Step 1: Create vector store
    const createVsResponse = await fetch("https://api.openai.com/v1/vector_stores", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `PDF-${Date.now()}` }),
    });

    if (!createVsResponse.ok) {
      const error = await createVsResponse.text();
      return new Response(
        JSON.stringify({ success: false, error: `Create failed: ${error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vs = await createVsResponse.json();
    const vectorStoreId = vs.id;
    console.log(`✅ Vector store created: ${vectorStoreId}`);

    // Step 2: Add files to vector store
    const addFilesResponse = await fetch(
      `https://api.openai.com/v1/vector_stores/${vectorStoreId}/file_batches`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_ids: fileIds }),
      }
    );

    if (!addFilesResponse.ok) {
      const error = await addFilesResponse.text();
      return new Response(
        JSON.stringify({ success: false, error: `Add files failed: ${error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const batch = await addFilesResponse.json();
    console.log(`✅ Files added. Batch status: ${batch.status}`);

    return new Response(
      JSON.stringify({
        success: true,
        vectorStoreId,
        batchStatus: batch.status,
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
