-- =========================================================
-- Migration 004: 三层角色权限体系
-- 主账号 (profiles.role=admin): 看全部
-- 项目管理员 (project_members.role=admin): 看该项目全部
-- 普通成员 (project_members.role=member): 只看自己上传
-- =========================================================

-- 1. project_members 加 role 列（默认 member），去掉旧的 see_own_only
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';
ALTER TABLE project_members DROP COLUMN IF EXISTS see_own_only;

-- 确保 role 值合法
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE project_members ADD CONSTRAINT project_members_role_check
  CHECK (role IN ('admin', 'member'));

-- 2. script_items 加上传者记录
ALTER TABLE script_items ADD COLUMN IF NOT EXISTS uploader_id TEXT;

-- 3. 已有数据：把主账号创建的内容标记 uploader_id
-- (如果 profiles 表有主账号记录)
DO $$ 
DECLARE
  master_id TEXT;
BEGIN
  SELECT id::TEXT INTO master_id FROM profiles WHERE role = 'admin' LIMIT 1;
  IF master_id IS NOT NULL THEN
    UPDATE script_items SET uploader_id = master_id WHERE uploader_id IS NULL;
  END IF;
END $$;
