-- Add show_price_summary column to pricing_quotes table
ALTER TABLE pricing_quotes 
ADD COLUMN IF NOT EXISTS show_price_summary BOOLEAN DEFAULT true;

-- Update existing quotes to have show_price_summary = true by default
UPDATE pricing_quotes 
SET show_price_summary = true 
WHERE show_price_summary IS NULL;


