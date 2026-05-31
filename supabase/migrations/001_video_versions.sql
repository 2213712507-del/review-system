-- 视频版本管理表
-- 在 Supabase Dashboard → SQL Editor 中执行

CREATE TABLE IF NOT EXISTS video_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES script_items(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  video_key TEXT NOT NULL,
  video_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  uploader_id UUID REFERENCES auth.users(id),
  uploader_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, version_no)
);

-- 索引：按条目查询所有版本
CREATE INDEX IF NOT EXISTS idx_video_versions_item_id ON video_versions(item_id);

-- 索引：按上传时间排序
CREATE INDEX IF NOT EXISTS idx_video_versions_created_at ON video_versions(item_id, created_at DESC);

-- RLS 策略
ALTER TABLE video_versions ENABLE ROW LEVEL SECURITY;

-- 所有登录用户可查看
CREATE POLICY "Authenticated users can view video_versions"
  ON video_versions FOR SELECT
  TO authenticated
  USING (true);

-- 所有登录用户可插入（上传视频）
CREATE POLICY "Authenticated users can insert video_versions"
  ON video_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);
