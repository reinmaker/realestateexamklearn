/**
 * Netlify Function: POST /api/grade
 * Verifies selected answer server-side and returns correct/wrong + explanation
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { question_id, selected_index } = body;

    if (!question_id || selected_index === undefined) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing question_id or selected_index' }),
      };
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query question with correct_index and explanation
    const { data, error } = await supabase
      .from('generated_questions')
      .select('id, correct_index, explanation, ref_title, ref_note, page')
      .eq('id', question_id)
      .single();

    if (error || !data) {
      console.error('Database error:', error);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Question not found' }),
      };
    }

    // Check if answer is correct
    const isCorrect = selected_index === data.correct_index;

    // Return result
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        correct: isCorrect,
        explanation: data.explanation || '',
        reference: `(ראו: ${data.ref_title}, ${data.ref_note})`,
        page: data.page,
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

