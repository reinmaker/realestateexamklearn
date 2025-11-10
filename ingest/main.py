"""
Main ingestion script: Parse PDF → Embed → Store → Generate MCQs → Store
"""
import os
import sys
import hashlib
import fitz
from dotenv import load_dotenv
from utils_pdf import extract_page_blocks, compute_page_sha, compute_char_offsets, derive_section_hint
from utils_db import create_embeddings, upsert_blocks, generate_mcq_for_block, compose_question_with_reference, insert_generated_questions

load_dotenv()

DOC_ID = os.getenv('DOC_ID', 'part1-2020')
PDF_PATH = './data/part1.pdf'


def main():
    """Main ingestion orchestration"""
    print(f"Starting ingestion for {DOC_ID}...")
    print(f"PDF path: {PDF_PATH}")
    
    if not os.path.exists(PDF_PATH):
        print(f"Error: PDF file not found at {PDF_PATH}")
        sys.exit(1)
    
    # Open PDF
    doc = fitz.open(PDF_PATH)
    total_pages = len(doc)
    print(f"Total pages: {total_pages}")
    
    # Process each page
    for page_num in range(1, total_pages + 1):
        print(f"\n--- Processing page {page_num}/{total_pages} ---")
        
        try:
            page = doc[page_num - 1]  # PyMuPDF uses 0-based indexing
            
            # Step 1: Compute page SHA for idempotency
            page_sha = compute_page_sha(page)
            print(f"Page SHA: {page_sha[:16]}...")
            
            # Step 2: Extract blocks
            blocks, full_page_text = extract_page_blocks(PDF_PATH, page_num)
            print(f"Extracted {len(blocks)} blocks")
            
            if not blocks:
                print(f"No blocks found on page {page_num}, skipping...")
                continue
            
            # Step 3: Compute char offsets
            blocks = compute_char_offsets(blocks, full_page_text)
            
            # Step 4: Derive section hint
            section_hint = derive_section_hint(full_page_text, blocks)
            print(f"Section hint: {section_hint}")
            
            # Add section hint to all blocks
            for block in blocks:
                block['section_hint'] = section_hint
            
            # Step 5: Generate embeddings for blocks
            block_texts = [block['text'] for block in blocks]
            print(f"Generating embeddings for {len(block_texts)} blocks...")
            embeddings = create_embeddings(block_texts)
            
            # Add embeddings to blocks
            for i, block in enumerate(blocks):
                block['embedding'] = embeddings[i]
            
            # Step 6: Upsert blocks to database
            print(f"Storing {len(blocks)} blocks to database...")
            upsert_blocks(blocks, DOC_ID, page_num, page_sha)
            
            # Step 7: Generate MCQs for suitable blocks (150-1200 chars)
            print(f"Generating MCQs for suitable blocks...")
            suitable_blocks = [b for b in blocks if 150 <= len(b['text']) <= 1200]
            print(f"Found {len(suitable_blocks)} suitable blocks (150-1200 chars)")
            
            all_questions = []
            for block in suitable_blocks:
                # Generate MCQ
                mcq = generate_mcq_for_block(block['text'], section_hint, page_num)
                
                if mcq:
                    # Compose question with reference (in code, not by AI)
                    question_with_ref = compose_question_with_reference(mcq, section_hint, page_num)
                    
                    # Compute source block SHA for tracking
                    source_block_sha = hashlib.sha256(block['text'].encode('utf-8')).hexdigest()
                    
                    all_questions.append({
                        'question': question_with_ref['question'],
                        'ref_title': question_with_ref['ref_title'],
                        'ref_note': question_with_ref['ref_note'],
                        'choices': question_with_ref['choices'],
                        'correct_index': question_with_ref['correct_index'],
                        'explanation': question_with_ref['explanation'],
                        'block_id': block['block_id'],
                        'source_block_sha': source_block_sha
                    })
                    
                    print(f"  Generated MCQ for block {block['block_id']}")
                else:
                    print(f"  Failed to generate MCQ for block {block['block_id']}")
            
            # Step 8: Insert generated questions
            if all_questions:
                print(f"Storing {len(all_questions)} questions to database...")
                for q in all_questions:
                    insert_generated_questions(
                        [q],
                        DOC_ID,
                        page_num,
                        q['block_id'],
                        q['source_block_sha']
                    )
                print(f"Page {page_num} complete: {len(all_questions)} questions generated")
            else:
                print(f"Page {page_num} complete: No questions generated")
                
        except Exception as e:
            print(f"Error processing page {page_num}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    doc.close()
    print(f"\n=== Ingestion complete for {DOC_ID} ===")


if __name__ == '__main__':
    main()

