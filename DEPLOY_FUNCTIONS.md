# Deploying Supabase Edge Functions

The `retrieve-blocks` function needs to be deployed to Supabase. Here are two ways to do it:

## Option 1: Deploy via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/arhoasurtfurjgfohlgt
2. Navigate to **Edge Functions** in the left sidebar
3. Click **Create a new function** or **Deploy function**
4. Name it: `retrieve-blocks`
5. Copy the contents of `supabase/functions/retrieve-blocks/index.ts` into the editor
6. Click **Deploy**

## Option 2: Deploy via Supabase CLI

1. Make sure you're logged in:
   ```bash
   supabase login
   ```

2. Navigate to the project directory:
   ```bash
   cd /Users/reinmkr/Downloads/realestatelearn
   ```

3. Link to your project (if not already linked):
   ```bash
   supabase link --project-ref arhoasurtfurjgfohlgt
   ```

4. Deploy the function:
   ```bash
   supabase functions deploy retrieve-blocks --project-ref arhoasurtfurjgfohlgt
   ```

## Required Environment Variables

Make sure these are set in your Supabase project settings (Settings > Edge Functions > Secrets):
- `OPENAI_API_KEY` - Your OpenAI API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

## Also Deploy generate-citation

Don't forget to deploy the `generate-citation` function as well:
- Same process as above, but use `generate-citation` as the function name
- Copy contents from `supabase/functions/generate-citation/index.ts`

## Also Deploy get-pdf-signed-url

Deploy the `get-pdf-signed-url` function to enable PDF downloads from private storage:
- Same process as above, but use `get-pdf-signed-url` as the function name
- Copy contents from `supabase/functions/get-pdf-signed-url/index.ts`
- This function uses the service role key to generate signed URLs for PDFs in the Materials bucket

