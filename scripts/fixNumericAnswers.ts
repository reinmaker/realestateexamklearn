import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

// ES module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
const envPath = resolve(__dirname, '../.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
} catch (error) {
  console.warn('Could not load .env.local file:', error);
}

const supabaseUrl = 'https://arhoasurtfurjgfohlgt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyaG9hc3VydGZ1cmpnZm9obGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNDQ5MDIsImV4cCI6MjA3NzgyMDkwMn0.FwXMPAnBpOhZnAg90PUQttaSvpgvVbRb_xNctF-reWw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface DbQuestion {
  id: string;
  question_number: number;
  question_text: string;
  options?: string[];
  answer?: string;
}

async function fixNumericAnswers() {
  console.log('Starting to fix numeric answers...');
  
  // Fetch all questions with answers
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, question_number, question_text, options, answer')
    .not('answer', 'is', null)
    .not('options', 'is', null)
    .order('question_number', { ascending: true });

  if (error) {
    console.error('Error fetching questions:', error);
    return;
  }

  if (!questions || questions.length === 0) {
    console.log('No questions to process.');
    return;
  }

  // Filter to only questions with numeric answers (stored as string like "0", "1", "2", "3")
  const numericAnswerQuestions = questions.filter(q => {
    if (!q.answer || !q.options || !Array.isArray(q.options)) {
      return false;
    }
    // Check if answer is a numeric string (matches pattern ^[0-9]+$)
    const answerStr = q.answer.trim();
    const isNumeric = /^[0-9]+$/.test(answerStr);
    return isNumeric;
  });

  if (numericAnswerQuestions.length === 0) {
    console.log('No questions with numeric answers found.');
    return;
  }

  console.log(`Found ${numericAnswerQuestions.length} questions with numeric answers to fix.`);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  // Process questions one by one
  for (const question of numericAnswerQuestions) {
    try {
      const answerIndex = parseInt(question.answer!.trim(), 10);
      
      // Validate answer index is within bounds
      if (isNaN(answerIndex) || answerIndex < 0 || answerIndex >= question.options!.length) {
        console.warn(`Question ${question.question_number}: Invalid answer index ${question.answer}, skipping...`);
        skipped++;
        continue;
      }

      // Get the correct answer text from options array
      const correctAnswerText = question.options![answerIndex];
      
      if (!correctAnswerText) {
        console.warn(`Question ${question.question_number}: No answer text found at index ${answerIndex}, skipping...`);
        skipped++;
        continue;
      }

      // Update the database with answer text instead of numeric index
      const { error: updateError } = await supabase
        .from('questions')
        .update({
          answer: correctAnswerText, // Store the actual answer text (not the index)
          updated_at: new Date().toISOString()
        })
        .eq('id', question.id);

      if (updateError) {
        console.error(`Error updating question ${question.question_number}:`, updateError);
        failed++;
      } else {
        processed++;
        console.log(`✓ Question ${question.question_number}: Fixed (${question.answer} -> "${correctAnswerText.substring(0, 50)}...")`);
      }

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`Error processing question ${question.question_number}:`, error);
      failed++;
    }
  }

  console.log(`\nCompleted!`);
  console.log(`Processed: ${processed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${numericAnswerQuestions.length}`);
}

// Run the script
fixNumericAnswers()
  .then(() => {
    console.log('Script completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

