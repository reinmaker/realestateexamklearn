/**
 * Netlify Function: GET /api/questions
 * Returns pre-generated MCQs without answers (read-only)
 */
import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const handler: Handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse query parameters
    const params = new URLSearchParams(event.queryStringParameters || '');
    const docId = params.get('doc_id') || 'part1-2020';
    const limit = parseInt(params.get('limit') || '25', 10);

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query generated_questions table
    const { data, error } = await supabase
      .from('generated_questions')
      .select('id, doc_id, page, question, ref_title, ref_note, choices, difficulty, tags')
      .eq('doc_id', docId)
      .order('page', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Database error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database query failed', details: error.message }),
      };
    }

    // Return questions without correct_index or explanation (hidden from client)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        items: data || [],
      }),
    };
  } catch (error: any) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: error.message }),
    };
  }
};

