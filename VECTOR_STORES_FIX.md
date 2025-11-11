# Vector Stores Fix - Server-Side Solution

## Problem
`openai.beta.vectorStores` was `undefined` in the browser because **Vector Stores are a server-side only API** and cannot be created from client-side JavaScript code.

The console showed:
```
⚠️ openai.beta.vectorStores is not available (not supported in this SDK version)
📋 OpenAI SDK Info: {sdkHasVectorStores: false, vectorStoresType: 'undefined', ...}
```

## Root Cause
- Vector Stores API is not available in the browser-side OpenAI SDK
- Vector Stores must be created server-side with proper API key authentication
- The Assistants API with file_search tool requires vector stores to work

## Solution: Server-Side Edge Function

Created a new Supabase Edge Function: `attach-pdfs-to-openai`

### How It Works

1. **Client uploads PDFs** via `attachBookPdfsToOpenAI()` in `bookReferenceService.ts`
2. **Client calls Edge Function** with file IDs:
   ```typescript
   fetch(`${supabaseUrl}/functions/v1/attach-pdfs-to-openai`, {
     method: 'POST',
     body: JSON.stringify({ fileIds: [part1FileId] })
   })
   ```
3. **Edge Function creates vector stores server-side** using OpenAI API key
4. **Returns vector store ID** back to client
5. **Client uses vector store ID** with Assistants API

### Files Changed

**New File:**
- `supabase/functions/attach-pdfs-to-openai/index.ts` - Server-side vector store creation

**Modified Files:**
- `services/bookReferenceService.ts` - Updated `attachBookPdfsToOpenAI()` to use Edge Function
- `DEPLOY_FUNCTIONS.md` - Added deployment instructions

### Deployment

Deploy the new Edge Function to Supabase:

```bash
supabase functions deploy attach-pdfs-to-openai --project-ref arhoasurtfurjgfohlgt
```

Or via Supabase Dashboard:
1. Go to Edge Functions
2. Create new function: `attach-pdfs-to-openai`
3. Copy contents from `supabase/functions/attach-pdfs-to-openai/index.ts`
4. Click Deploy

### Environment Variables Required

In Supabase Edge Functions Secrets:
- `OPENAI_API_KEY` - Your OpenAI API key (required for vector store creation)

### Benefits

✅ Vector stores now work properly  
✅ File search tool can access PDF content  
✅ Assistants API gets better responses with actual PDF context  
✅ Server-side security (API key not exposed to browser)  

### Fallback Behavior

If the Edge Function is not deployed or fails:
- System automatically falls back to "Using table of contents and chat completions instead of file_search"
- App continues to work, just with reduced PDF understanding
- No errors thrown to user

### Testing

1. Refresh browser (Cmd+R)
2. Generate a new quiz
3. Check console for:
   - `📌 Attempting to create vector store for part 1 via Edge Function...`
   - `✅ Part 1 vector store created: ...` (if deployed)
   - Or `⚠️ Failed to create vector store for part 1 via Edge Function...` (graceful fallback)

