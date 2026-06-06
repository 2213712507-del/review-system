-- 版本已读状态追踪表
-- 记录每个用户对每个条目最后查看过的版本号
-- 在 Supabase Dashboard → SQL Editor 中执行

CREATE TABLE IF NOT EXISTS video_version_seen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES script_items(id) ON DELETE CASCADE,
  last_seen_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_version_seen_user ON video_version_seen(user_id);
CREATE INDEX IF NOT EXISTS idx_version_seen_item ON video_version_seen(item_id);

ALTER TABLE video_version_seen ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的已读记录
CREATE POLICY "Users can view own version_seen"
  ON video_version_seen FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::UUID);

-- 用户可以插入自己的已读记录
CREATE POLICY "Users can insert own version_seen"
  ON video_version_seen FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::UUID);

-- 用户可以更新自己的已读记录
CREATE POLICY "Users can update own version_seen"
  ON video_version_seen FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::UUID)
  WITH CHECK (user_id = auth.uid()::UUID);

-- 上传者可以删除条目的所有已读记录（上传新版本时重置）
CREATE POLICY "Authenticated users can delete version_seen"
  ON video_version_seen FOR DELETE
  TO authenticated
  USING (true);
