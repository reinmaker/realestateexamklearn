import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_API_BASE = "https://api.openai.com/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const { vectorStoreId, question, topic } = await req.json();

    if (!vectorStoreId || !question) {
      throw new Error("Missing vectorStoreId or question");
    }

    // Extract key legal terms from question for better context
    const legalTerms = question
      .replace(/[?!.,]/g, '')
      .split(/\s+/)
      .filter(term => term.length > 3 && /[\u0590-\u05FF]/.test(term))
      .slice(0, 5)
      .join(', ');

    // Map topics to expected law names for validation
    const topicToLawMap: Record<string, string> = {
      '1': 'חוק המתווכים במקרקעין',
      '2': 'חוק המכר (דירות)',
      '3': 'חוק המקרקעין',
      '4': 'חוק התכנון והבנייה',
      '5': 'חוק הגנת הדייר',
      '6': 'חוק רישום מקרקעין',
    };

    const expectedLaw = topic ? topicToLawMap[topic] : null;
    const lawContext = expectedLaw ? `\n\nהערה חשובה: השאלה שייכת לנושא "${expectedLaw}". ודא שההפניה היא לחוק זה או לחוק קשור ישירות.` : '';

    // Create assistant with file_search tool - using gpt-4o for better accuracy
    const assistantRes = await fetch(`${OPENAI_API_BASE}/assistants`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        model: "gpt-4o", // Using gpt-4o instead of mini for better accuracy
        name: "File Search Assistant",
        instructions: `אתה חוקר משפטי מומחה בחוקי הנדלן בישראל. תפקידך למצוא הפניה מדויקת לחוק הרלוונטי לשאלה.

חוקים עקריים:
1. חוק המתווכים במקרקעין, התשנ"ו–1996 - עוסק בתיווך, בלעדיות, דמי תיווך
2. חוק המכר (דירות), התשנ"ג–1993 - עוסק במכירת דירות, הסכמי מכר, זכויות קונה/מוכר
3. חוק המקרקעין, התשכ"ט–1969 - עוסק בזכויות קניין, בתים משותפים, חכירה
4. חוק התכנון והבנייה, התשכ"ה–1965 - עוסק בתכנון, היתרי בנייה, שימושי קרקע
5. חוק הגנת הדייר, התשל"ב–1972 - עוסק בדיירים מוגנים, פינוי, שכר דירה
6. חוק רישום מקרקעין - עוסק ברישום, הערת אזהרה, זכויות

CRITICAL - כללים קפדניים:
1. חפש בקבצי ה-PDF את המושגים הספציפיים בשאלה: "${legalTerms}"
2. חייב להיות קשר ישיר ומובהק בין השאלה לסעיף החוק - לא קשר רופף או עקיף
3. מצא את מספר הסעיף המדויק (לא מספר פרק או תת-סעיף) שדן בדיוק בנושא השאלה
4. מצא את מספר העמוד המדויק בקובץ שבו מופיע הסעיף הזה
5. ודא ששם החוק תואם לנושא השאלה - אם השאלה על תיווך, החוק חייב להיות חוק המתווכים
6. אם השאלה על מכר דירות, החוק חייב להיות חוק המכר (דירות)
7. אם השאלה על תכנון ובנייה, החוק חייב להיות חוק התכנון והבנייה
8. אם לא מצאת התאמה ישירה וברורה - החזר "לא נמצא בקובץ". אל תנחש או תמציא.
9. אם נמצאו כמה התאמות - בחר את ההתאמה הכי מדויקת והכי ישירה לנושא השאלה
10. ודא שהסעיף שתמצא אכן דן בנושא השאלה - קרא את תוכן הסעיף ולא רק את הכותרת${lawContext}

תשובה - בפורמט בדיוק זה ללא כל טקסט נוסף:
[שם החוק המלא עם שנה] – סעיף X מופיע בעמ' Y בקובץ.

דוגמאות תקינות:
- "חוק המתווכים במקרקעין, התשנ"ו–1996 – סעיף 8 מופיע בעמ' 2 בקובץ."
- "חוק המכר (דירות), התשנ"ג–1993 – סעיף 2 מופיע בעמ' 15 בקובץ."
- "חוק התכנון והבנייה, התשכ"ה–1965 – סעיף 113 מופיע בעמ' 95 בקובץ."

אם לא מצאת קשר ישיר וברור בקובץ: "לא נמצא בקובץ"`,
        tools: [{ type: "file_search" }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStoreId]
          }
        }
      })
    });

    if (!assistantRes.ok) {
      const error = await assistantRes.text();
      console.error(`❌ Failed to create assistant: ${error}`);
      throw new Error(`Failed to create assistant: ${error}`);
    }

    const assistant = await assistantRes.json();
    const assistantId = assistant.id;

    // Create thread
    const threadRes = await fetch(`${OPENAI_API_BASE}/threads`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      }
    });

    if (!threadRes.ok) {
      throw new Error(`Failed to create thread: ${await threadRes.text()}`);
    }

    const thread = await threadRes.json();
    const threadId = thread.id;

    // Add message to thread
    const messageRes = await fetch(`${OPENAI_API_BASE}/threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        role: "user",
        content: question
      })
    });

    if (!messageRes.ok) {
      throw new Error(`Failed to add message: ${await messageRes.text()}`);
    }

    // Run assistant
    const runRes = await fetch(`${OPENAI_API_BASE}/threads/${threadId}/runs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "assistants=v2",
      },
      body: JSON.stringify({
        assistant_id: assistantId
      })
    });

    if (!runRes.ok) {
      throw new Error(`Failed to create run: ${await runRes.text()}`);
    }

    const run = await runRes.json();
    let runId = run.id;

    // Poll for completion
    let runStatus = run.status;
    let attempts = 0;
    const maxAttempts = 60; // 1 minute

    while ((runStatus === "queued" || runStatus === "in_progress") && attempts < maxAttempts) {
      await sleep(1000);
      attempts++;

      const statusRes = await fetch(`${OPENAI_API_BASE}/threads/${threadId}/runs/${runId}`, {
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        }
      });

      if (!statusRes.ok) {
        throw new Error(`Failed to poll run status: ${await statusRes.text()}`);
      }

      const statusData = await statusRes.json();
      runStatus = statusData.status;
    }

    if (runStatus !== "completed") {
      throw new Error(`Run failed with status: ${runStatus}`);
    }

    // Get messages
    const messagesRes = await fetch(`${OPENAI_API_BASE}/threads/${threadId}/messages`, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2",
      }
    });

    if (!messagesRes.ok) {
      throw new Error(`Failed to get messages: ${await messagesRes.text()}`);
    }

    const messages = await messagesRes.json();

    // Find the assistant's response
    let response_text = "";
    if (messages.data && messages.data.length > 0) {
      for (const msg of messages.data) {
        if (msg.role === "assistant" && msg.content && msg.content.length > 0) {
          response_text = msg.content[0].text.value;
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        response: response_text
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error: ${msg}`);

    return new Response(
      JSON.stringify({ success: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
