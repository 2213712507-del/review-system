-- =========================================================
-- Migration 005: 添加分配人功能
-- 每个脚本条目可指定分配人，用户只能看到与自己有关的条目
-- =========================================================

ALTER TABLE script_items ADD COLUMN IF NOT EXISTS assignee_id TEXT;

COMMENT ON COLUMN script_items.assignee_id IS '分配人用户ID (关联 profiles.id)';
