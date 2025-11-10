# Generated Questions Setup Guide

This guide explains how to set up and use the automated MCQ generation system.

## Overview

The system automatically:
1. Ingests legal PDFs (per-page, per-block)
2. Generates American-style exam questions (4 options, 1 correct) in Hebrew
3. Automatically adds page references to each question
4. Stores all questions server-side
5. Serves them automatically to the frontend

## Architecture

- **Ingestion**: Python script (`ingest/`) parses PDFs, generates MCQs, stores in database
- **API**: Netlify Functions (`netlify/functions/`) provide read-only endpoints
- **Frontend**: Auto-loads questions on mount, displays with grading

## Setup Steps

### 1. Database Schema

Run the SQL migration to create the required tables:

```bash
# Connect to your Supabase project
# Run the SQL from sql/001_schema.sql
```

Or use Supabase dashboard:
1. Go to SQL Editor
2. Copy contents of `sql/001_schema.sql`
3. Run the query

This creates:
- `legal_blocks` table for storing parsed PDF content
- `generated_questions` table for storing pre-generated MCQs

### 2. Install Python Dependencies

```bash
pip install -r ingest/requirements.txt
```

Required packages:
- PyMuPDF (fitz) - PDF parsing
- openai - Question generation
- supabase - Database operations
- python-dotenv - Environment variables

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
DOC_ID=part1-2020
```

**Important**: Never commit `.env` to version control!

### 4. Prepare PDF File

Place your PDF file at:

```
./data/part1.pdf
```

The script will parse this file and generate questions from it.

### 5. Run Ingestion

```bash
# Make script executable (first time only)
chmod +x scripts/ingest.sh

# Run ingestion
./scripts/ingest.sh
```

Or directly:

```bash
python ingest/main.py
```

The script will:
1. Parse each page of the PDF
2. Extract text blocks with coordinates
3. Generate embeddings for each block
4. Store blocks in `legal_blocks` table
5. Generate MCQs for suitable blocks (150-1200 chars)
6. Store questions in `generated_questions` table

**Note**: Ingestion is idempotent - safe to re-run if PDF changes.

### 6. Deploy Netlify Functions

If using Netlify:

1. Set environment variables in Netlify dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Deploy:

```bash
netlify deploy --prod
```

Functions are automatically deployed from `netlify/functions/` directory.

### 7. Test API Endpoints

#### Get Questions

```bash
curl "https://your-site.netlify.app/api/questions?doc_id=part1-2020&limit=25"
```

Returns:
```json
{
  "items": [
    {
      "id": 1,
      "doc_id": "part1-2020",
      "page": 1,
      "question": "שאלה... (ראו: חוק..., עמ׳ 1)",
      "ref_title": "חוק המתווכים במקרקעין",
      "ref_note": "עמ׳ 1",
      "choices": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
      "difficulty": null,
      "tags": null
    }
  ]
}
```

#### Grade Answer

```bash
curl -X POST "https://your-site.netlify.app/api/grade" \
  -H "Content-Type: application/json" \
  -d '{"question_id": 1, "selected_index": 0}'
```

Returns:
```json
{
  "correct": true,
  "explanation": "הסבר קצר...",
  "reference": "(ראו: חוק..., עמ׳ 1)",
  "page": 1
}
```

## Frontend Integration

Questions are automatically loaded on app mount via `useEffect` in `App.tsx`.

The `GeneratedQuestionsView` component displays:
- Question text (with reference)
- 4 radio button options
- Page reference link
- Instant grading on selection
- Explanation after grading

## Production Considerations

### Security

- **Never expose** `SUPABASE_SERVICE_ROLE_KEY` to client-side code
- **Never expose** `OPENAI_API_KEY` to client-side code
- Use Netlify environment variables for functions
- Use `.env.local` for local development (not committed to git)

### Performance

- Questions are pre-generated during ingestion (not on-demand)
- API endpoints are read-only (fast database queries)
- Frontend caches questions in state

### Idempotency

- Ingestion checks `page_sha` before processing (skips unchanged pages)
- Questions use unique index for deduplication
- Safe to re-run ingestion if PDF updates

## Troubleshooting

### Questions not appearing

1. Check if ingestion completed successfully
2. Verify database has data: `SELECT COUNT(*) FROM generated_questions;`
3. Check browser console for API errors
4. Verify Netlify Functions are deployed

### Ingestion errors

1. Verify PDF file exists at `./data/part1.pdf`
2. Check environment variables are set correctly
3. Verify OpenAI API key is valid
4. Check Supabase connection (URL and service role key)

### API errors

1. Verify Netlify Functions environment variables
2. Check Supabase connection from functions
3. Verify CORS settings if calling from different domain

## Next Steps

- Add more PDFs (part2.pdf, etc.)
- Customize question generation prompts
- Add difficulty levels and tags
- Implement question filtering/search
- Add analytics for question performance

