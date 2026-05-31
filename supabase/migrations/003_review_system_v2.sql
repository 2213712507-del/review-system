-- =========================================================
-- Migration 003: review-system v2 功能
-- 包含: project_members, user_permissions, profiles扩展, script_items扩展
-- =========================================================

-- 1. 项目成员表（Feature 1: 项目级访问控制）
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memberships"
  ON project_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::TEXT);

CREATE POLICY "Admins can manage memberships"
  ON project_members FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::UUID AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::UUID AND role = 'admin')
  );

-- 2. 用户权限表（Feature 2: 操作级权限系统）
CREATE TABLE IF NOT EXISTS user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  project_id UUID,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_project ON user_permissions(project_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage permissions"
  ON user_permissions FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::UUID AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()::UUID AND role = 'admin')
  );

CREATE POLICY "Users can view own permissions"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::TEXT);

-- 3. profiles 表扩展（Feature 2 & 3）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS remark TEXT DEFAULT '';

-- 允许用户插入/更新自己的 profile
CREATE POLICY IF NOT EXISTS "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid()::UUID);

CREATE POLICY IF NOT EXISTS "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid()::UUID)
  WITH CHECK (id = auth.uid()::UUID);

-- 4. script_items 扩展（Feature 5）
ALTER TABLE script_items ADD COLUMN IF NOT EXISTS script_text TEXT DEFAULT '';
