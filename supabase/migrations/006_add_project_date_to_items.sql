-- 给 script_items 添加项目ID和拍摄日期ID关联字段
ALTER TABLE script_items
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_id UUID REFERENCES shoot_dates(id) ON DELETE SET NULL;

-- 索引加速按项目/日期查询
CREATE INDEX IF NOT EXISTS idx_script_items_project ON script_items(project_id);
CREATE INDEX IF NOT EXISTS idx_script_items_date ON script_items(date_id);
