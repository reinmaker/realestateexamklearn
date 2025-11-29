-- Create user_payments table for Stripe payment tracking
CREATE TABLE IF NOT EXISTS user_payments (
  email TEXT NOT NULL,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  amount INTEGER NOT NULL, -- Amount in agorot (16900 for 169 NIS)
  currency TEXT NOT NULL DEFAULT 'ils',
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled')),
  exam_period TEXT NOT NULL, -- Exam name/date this payment covers (e.g., 'מועד סתיו 2025')
  expires_at TIMESTAMPTZ NOT NULL, -- When payment expires (exam date)
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_payments_user_id ON user_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payments_status ON user_payments(status);
CREATE INDEX IF NOT EXISTS idx_user_payments_expires_at ON user_payments(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_payments_email ON user_payments(email);

-- Enable Row Level Security
ALTER TABLE user_payments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own payments
CREATE POLICY "Users can view their own payments"
  ON user_payments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for Edge Functions)
CREATE POLICY "Service role can manage all payments"
  ON user_payments
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_user_payments_updated_at
  BEFORE UPDATE ON user_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

