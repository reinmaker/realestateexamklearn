"""
Database utilities for storing blocks and generating questions
"""
import os
import json
import hashlib
from typing import List, Dict, Optional
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Initialize Supabase client
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase: Client = create_client(supabase_url, supabase_key)


def create_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Create embeddings for a batch of texts using OpenAI text-embedding-3-small
    
    Args:
        texts: List of text strings
    
    Returns:
        List of embedding vectors (each is a list of 1536 floats)
    """
    try:
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=texts
        )
        return [item.embedding for item in response.data]
    except Exception as e:
        print(f"Error creating embeddings: {e}")
        raise


def upsert_blocks(blocks: List[Dict], doc_id: str, page_number: int, page_sha: str) -> None:
    """
    Upsert blocks into legal_blocks table
    
    Args:
        blocks: List of block dicts with text, bbox, char_start, char_end, section_hint, embedding
        doc_id: Document ID (e.g., "part1-2020")
        page_number: Page number
        page_sha: SHA256 hash of page for idempotency
    """
    # Check if page already exists with same SHA (idempotency)
    existing = supabase.table('legal_blocks').select('id').eq('doc_id', doc_id).eq('page_number', page_number).eq('page_sha', page_sha).execute()
    
    if existing.data:
        print(f"Page {page_number} already exists with same SHA, skipping...")
        return
    
    # Prepare data for insertion
    records = []
    for block in blocks:
        record = {
            'doc_id': doc_id,
            'page_sha': page_sha,
            'page_number': page_number,
            'block_id': block['block_id'],
            'text': block['text'],
            'section_hint': block.get('section_hint'),
            'bbox_left': block['bbox']['left'],
            'bbox_top': block['bbox']['top'],
            'bbox_right': block['bbox']['right'],
            'bbox_bottom': block['bbox']['bottom'],
            'embedding': block.get('embedding')
        }
        records.append(record)
    
    # Batch insert
    if records:
        result = supabase.table('legal_blocks').insert(records).execute()
        print(f"Inserted {len(records)} blocks for page {page_number}")


def generate_mcq_for_block(block_text: str, section_hint: str, page_number: int) -> Optional[Dict]:
    """
    Generate a single MCQ (multiple choice question) for a block using OpenAI
    
    Args:
        block_text: Text content of the block
        section_hint: Section hint for reference
        page_number: Page number for reference
    
    Returns:
        Dict with: stem, options (list of 4), correct_index (0-3), explanation
        Returns None if generation fails
    """
    system_prompt = """אתה יוצר שאלות קצרות לבחינה בעברית מתוך טקסט משפטי. 
    
כל שאלה חייבת להיות:
- שאלה אמריקאית עם 4 אפשרויות תשובה
- אחת מהאפשרויות היא הנכונה
- השאלה והאפשרויות בעברית
- השאלה מבוססת אך ורק על הטקסט שסופק
- השאלה קצרה וברורה

החזר JSON בפורמט:
{
  "stem": "טקסט השאלה",
  "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
  "correct_index": 0,
  "explanation": "הסבר קצר למה התשובה נכונה"
}"""

    user_prompt = f"""צור שאלה אמריקאית אחת בעברית מתוך הטקסט הבא:

{block_text}

השאלה חייבת להיות מבוססת אך ורק על הטקסט שסופק. אל תיצור שאלות על נושאים שלא מופיעים בטקסט."""

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        mcq = json.loads(content)
        
        # Validate structure
        if 'stem' not in mcq or 'options' not in mcq or 'correct_index' not in mcq:
            print(f"Invalid MCQ structure: {mcq}")
            return None
        
        if not isinstance(mcq['options'], list) or len(mcq['options']) != 4:
            print(f"Invalid options count: {len(mcq.get('options', []))}")
            return None
        
        if not 0 <= mcq['correct_index'] < 4:
            print(f"Invalid correct_index: {mcq['correct_index']}")
            return None
        
        return mcq
        
    except Exception as e:
        print(f"Error generating MCQ: {e}")
        return None


def compose_question_with_reference(mcq: Dict, section_hint: str, page_number: int) -> Dict:
    """
    Compose question with reference string (in code, not by AI)
    
    Args:
        mcq: MCQ dict with stem, options, correct_index, explanation
        section_hint: Section hint for reference
        page_number: Page number for reference
    
    Returns:
        Updated MCQ dict with question field containing reference
    """
    ref_title = section_hint or "הספר"
    
    # Compose question with reference
    # Format: (ראו: {ref_title})
    # Keep only the law/section reference, no instruction text or page numbers
    question_with_ref = f"{mcq['stem']} (ראו: {ref_title})"
    
    return {
        'question': question_with_ref,
        'ref_title': ref_title,
        'ref_note': f"עמ׳ {page_number}",  # Keep for backward compatibility
        'choices': mcq['options'],
        'correct_index': mcq['correct_index'],
        'explanation': mcq.get('explanation', '')
    }


def insert_generated_questions(questions: List[Dict], doc_id: str, page: int, block_id: str, source_block_sha: str) -> None:
    """
    Insert generated questions into generated_questions table
    
    Args:
        questions: List of question dicts with question, ref_title, ref_note, choices, correct_index, explanation
        doc_id: Document ID
        page: Page number
        block_id: Block ID
        source_block_sha: SHA of source block for tracking
    """
    records = []
    for q in questions:
        record = {
            'doc_id': doc_id,
            'page': page,
            'block_id': block_id,
            'question': q['question'],
            'ref_title': q['ref_title'],
            'ref_note': q['ref_note'],
            'choices': q['choices'],
            'correct_index': q['correct_index'],
            'explanation': q.get('explanation', ''),
            'source_block_sha': source_block_sha
        }
        records.append(record)
    
    if records:
        # Use ON CONFLICT DO NOTHING for idempotency
        result = supabase.table('generated_questions').insert(records).execute()
        print(f"Inserted {len(records)} questions for block {block_id}")

