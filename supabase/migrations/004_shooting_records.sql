-- =====================================================
-- Migration 004: 拍摄时长记录表
-- =====================================================

-- 拍摄时长记录表
CREATE TABLE IF NOT EXISTS shooting_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shoot_date DATE NOT NULL,
  duration INTEGER NOT NULL CHECK (duration > 0),  -- 单位：分钟
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shooting_records_user ON shooting_records(user_id);
CREATE INDEX IF NOT EXISTS idx_shooting_records_date ON shooting_records(shoot_date DESC);

-- RLS 策略
ALTER TABLE shooting_records ENABLE ROW LEVEL SECURITY;

-- 所有登录用户可查看
CREATE POLICY "Authenticated users can view shooting_records"
  ON shooting_records FOR SELECT
  TO authenticated
  USING (true);

-- 管理员可增删改
CREATE POLICY "Admins can manage shooting_records"
  ON shooting_records FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::UUID AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::UUID AND role = 'admin')
  );
