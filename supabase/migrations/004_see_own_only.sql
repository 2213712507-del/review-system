-- =========================================================
-- Migration 004: 一账号一内容权限
-- =========================================================

-- 1. project_members 加 see_own_only 开关
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS see_own_only BOOLEAN DEFAULT false;

-- 2. script_items 加上传者记录
ALTER TABLE script_items ADD COLUMN IF NOT EXISTS uploader_id TEXT;
