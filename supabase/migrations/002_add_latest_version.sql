-- 给 script_items 添加 latest_version 字段
ALTER TABLE script_items ADD COLUMN IF NOT EXISTS latest_version INTEGER DEFAULT 1;
