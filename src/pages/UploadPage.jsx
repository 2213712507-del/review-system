import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// 上传状态标签
const statusLabels = {
  pending_upload: '待提交',
  in_review: '已提交',
  approved: '已通过',
  rejected: '不通过',
};

export default function UploadPage() {
  const { user, canSeeAllInProject } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) fetchItems(selectedProject);
  }, [selectedProject]);

  async function fetchProjects() {
    // 非管理员：只看被分配的项目
    let query = supabase.from('projects').select('id,name').order('created_at', { ascending: false });
    if (!canSeeAllInProject(null)) {
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id);
      const ids = (memberships || []).map((m) => m.project_id);
      if (ids.length === 0) { setProjects([]); return; }
      query = query.in('id', ids);
    }
    const { data } = await query;
    setProjects(data || []);
    if (data && data.length > 0 && !selectedProject) {
      setSelectedProject(data[0].id);
    }
  }

  async function fetchItems(projectId) {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('script_items')
        .select('*')
        .eq('project_id', projectId)
        .order('script_number', { ascending: true });
      // 普通成员只看自己上传
      let itemsData = data || [];
      if (!canSeeAllInProject(projectId)) {
        itemsData = itemsData.filter((item) => item.uploader_id === user.id);
      }
      setItems(itemsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(itemId, file) {
    setUploading(itemId);
    try {
      const ext = file.name.split('.').pop();
      const key = `projects/${selectedProject}/items/${itemId}/v1.${ext}`;

      // 获取预签名 URL
      const { data: presignData, error: presignError } = await supabase.functions.invoke('get-cos-upload-url', {
        body: { key, contentType: file.type },
      });
      if (presignError) throw new Error('获取上传链接失败');

      const uploadUrl = presignData.url || presignData;

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      // 更新数据库
      await supabase
        .from('script_items')
        .update({ video_key: key, status: 'in_review', uploader_id: user.id })
        .eq('id', itemId);

      setItems(items.map((i) =>
        i.id === itemId ? { ...i, video_key: key, status: 'in_review' } : i
      ));
    } catch (err) {
      alert('上传失败: ' + err.message);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>视频上传</h2>

      {/* 项目选择器 */}
      <div style={styles.projectBar}>
        <span style={styles.label}>当前项目：</span>
        <select
          style={styles.select}
          value={selectedProject || ''}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={styles.empty}>加载中...</p>
      ) : items.length === 0 ? (
        <p style={styles.empty}>暂无脚本条目</p>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={styles.colNum}>脚本号</span>
            <span style={styles.colName}>脚本名称</span>
            <span style={styles.colStatus}>上传状态</span>
            <span style={styles.colAction}>操作</span>
          </div>
          {items.map((item) => (
            <div key={item.id} style={styles.row}>
              <span style={styles.colNum}>{item.script_number || '-'}</span>
              <span style={styles.colName}>{item.script_name || '-'}</span>
              <span style={styles.colStatus}>
                <span style={{
                  ...styles.statusBadge,
                  background: item.status === 'pending_upload' ? '#f5f5f5' :
                    item.status === 'in_review' ? '#fef3c7' :
                    item.status === 'approved' ? '#dcfce7' : '#fecaca',
                  color: item.status === 'pending_upload' ? '#888' :
                    item.status === 'in_review' ? '#92400e' :
                    item.status === 'approved' ? '#16a34a' : '#dc2626',
                }}>
                  {statusLabels[item.status] || item.status}
                </span>
              </span>
              <span style={styles.colAction}>
                <label style={{
                  ...styles.uploadBtn,
                  opacity: uploading === item.id ? 0.6 : 1,
                }}>
                  {uploading === item.id ? '上传中...' : '上传视频'}
                  <input
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    disabled={uploading === item.id}
                    onChange={(e) => {
                      if (e.target.files[0]) handleUpload(item.id, e.target.files[0]);
                    }}
                  />
                </label>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '40px 24px',
  },
  title: {
    fontSize: 22,
    fontWeight: 600,
    color: '#1a1a1a',
    margin: '0 0 24px 0',
  },
  projectBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    padding: '12px 16px',
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #eee',
  },
  label: {
    fontSize: 13,
    color: '#888',
  },
  select: {
    padding: '6px 12px',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
    background: '#fff',
  },
  table: {
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #f0f0f0',
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    padding: '12px 16px',
    background: '#fafafa',
    borderBottom: '1px solid #eee',
    fontSize: 12,
    color: '#888',
    fontWeight: 500,
  },
  row: {
    display: 'flex',
    padding: '14px 16px',
    borderBottom: '1px solid #f5f5f5',
    alignItems: 'center',
    fontSize: 13,
  },
  colNum: { width: 100, flexShrink: 0 },
  colName: { flex: 1 },
  colStatus: { width: 100, flexShrink: 0 },
  colAction: { width: 120, flexShrink: 0, textAlign: 'right' },
  statusBadge: {
    padding: '2px 10px',
    borderRadius: 10,
    fontSize: 12,
  },
  uploadBtn: {
    padding: '6px 14px',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    display: 'inline-block',
  },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    marginTop: 60,
    fontSize: 14,
  },
};
