"""
PDF parsing utilities using PyMuPDF (fitz)
"""
import fitz
import hashlib
import re
from typing import List, Dict, Tuple, Optional


def compute_page_sha(page: fitz.Page) -> str:
    """Compute SHA256 hash of page rawdict for idempotency"""
    rawdict = page.get_text("rawdict")
    rawdict_str = str(rawdict)
    return hashlib.sha256(rawdict_str.encode('utf-8')).hexdigest()


def extract_page_blocks(pdf_path: str, page_num: int) -> Tuple[List[Dict], str]:
    """
    Extract blocks from a specific page using PyMuPDF
    
    Returns:
        Tuple of (blocks list, full page text)
    """
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]  # PyMuPDF uses 0-based indexing
    
    # Get full page text for char offset calculation
    full_page_text = page.get_text()
    
    # Get blocks with bbox information
    blocks = page.get_text("blocks")
    
    extracted_blocks = []
    for i, block in enumerate(blocks):
        if len(block) >= 5:
            x0, y0, x1, y1, text, block_type, *_ = block
            
            # Only process text blocks (block_type == 0)
            if block_type == 0 and text.strip():
                block_id = f"p{page_num}-b{i:02d}"
                
                extracted_blocks.append({
                    'block_id': block_id,
                    'text': text.strip(),
                    'bbox': {
                        'left': int(x0),
                        'top': int(y0),
                        'right': int(x1),
                        'bottom': int(y1)
                    }
                })
    
    doc.close()
    return extracted_blocks, full_page_text


def compute_char_offsets(blocks: List[Dict], full_page_text: str) -> List[Dict]:
    """
    Calculate char_start and char_end for each block within the full page text
    
    Args:
        blocks: List of block dicts with 'text' field
        full_page_text: Full text of the page
    
    Returns:
        Blocks with added 'char_start' and 'char_end' fields
    """
    current_pos = 0
    
    for block in blocks:
        block_text = block['text']
        
        # Find the block text in the full page text starting from current position
        start_pos = full_page_text.find(block_text, current_pos)
        
        if start_pos != -1:
            block['char_start'] = start_pos
            block['char_end'] = start_pos + len(block_text)
            current_pos = start_pos + len(block_text)
        else:
            # Fallback: approximate position
            block['char_start'] = current_pos
            block['char_end'] = current_pos + len(block_text)
            current_pos += len(block_text)
    
    return blocks


def derive_section_hint(page_text: str, blocks: List[Dict]) -> str:
    """
    Derive a section hint from page text
    
    Priority:
    1. Law title (חוק ...)
    2. Section number (סעיף ...)
    3. First non-empty line (trim to 60 chars)
    """
    # Law title regex: חוק ... , התש...–YYYY
    law_title_pattern = r'^חוק\s+[^,]+,\s+התש[^\d]*–\d{4}'
    
    # Section regex: סעיף N or סעיף N(א/ב/ג)
    section_pattern = r'^סעיף\s*\d+(\([א-ת0-9]+\))?'
    
    lines = page_text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for law title
        if re.match(law_title_pattern, line):
            # Extract law name and format
            match = re.match(r'^חוק\s+([^,]+)', line)
            if match:
                law_name = match.group(1).strip()
                # Try to find section number
                section_match = re.search(r'סעיף\s*(\d+(\([א-ת0-9]+\))?)', page_text)
                if section_match:
                    section = section_match.group(1)
                    return f"חוק {law_name} §{section}"
                return f"חוק {law_name}"
        
        # Check for section
        section_match = re.match(section_pattern, line)
        if section_match:
            section = section_match.group(0)
            # Try to find law name
            law_match = re.search(law_title_pattern, page_text)
            if law_match:
                law_name_match = re.match(r'^חוק\s+([^,]+)', law_match.group(0))
                if law_name_match:
                    law_name = law_name_match.group(1).strip()
                    return f"חוק {law_name} §{section}"
            return section
    
    # Fallback: first non-empty line (trim to 60 chars)
    for line in lines:
        line = line.strip()
        if line:
            return line[:60]
    
    return "הספר"

