-- Enable required extensions
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Legal blocks table for storing parsed PDF content
create table if not exists legal_blocks (
  id bigserial primary key,
  doc_id text not null,
  page_sha text not null,
  page_number int not null,
  block_id text not null,
  text text not null,
  section_hint text,
  bbox_left int,
  bbox_top int,
  bbox_right int,
  bbox_bottom int,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Generated questions table for storing pre-generated MCQs
create table if not exists generated_questions (
  id bigserial primary key,
  doc_id text not null,
  page int not null,
  block_id text not null,
  question text not null,
  ref_title text,
  ref_note text,
  difficulty text,
  tags text[],
  choices jsonb not null,  -- Array of 4 strings
  correct_index int not null,  -- 0-3
  explanation text,
  source_block_sha text,
  created_at timestamptz default now()
);

-- Indexes for legal_blocks
create index if not exists idx_lb_doc_page on legal_blocks (doc_id, page_number);
create index if not exists idx_lb_trgm on legal_blocks using gin (text gin_trgm_ops);
create index if not exists idx_lb_vec on legal_blocks using ivfflat (embedding vector_cosine_ops);

-- Indexes for generated_questions
create index if not exists idx_gq_doc_page on generated_questions (doc_id, page);
create unique index if not exists idx_gq_unique on generated_questions (doc_id, page, block_id, md5(question));

-- Optional fields for legal_blocks (if not already present)
ALTER TABLE legal_blocks 
ADD COLUMN IF NOT EXISTS law_title TEXT,
ADD COLUMN IF NOT EXISTS section_code TEXT;

-- Index for section filtering
CREATE INDEX IF NOT EXISTS idx_lb_section ON legal_blocks (doc_id, section_hint);

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION match_blocks(
  query_embedding vector(1536),
  match_doc_id text DEFAULT 'part1',
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  doc_id text,
  page_number int,
  block_id text,
  text text,
  section_hint text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    legal_blocks.doc_id,
    legal_blocks.page_number,
    legal_blocks.block_id,
    legal_blocks.text,
    legal_blocks.section_hint,
    1 - (legal_blocks.embedding <=> query_embedding) AS similarity
  FROM legal_blocks
  WHERE legal_blocks.doc_id = match_doc_id
    AND legal_blocks.embedding IS NOT NULL
    AND 1 - (legal_blocks.embedding <=> query_embedding) > match_threshold
  ORDER BY legal_blocks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

