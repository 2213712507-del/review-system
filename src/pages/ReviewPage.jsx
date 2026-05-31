import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// 审核状态标签
const statusLabels = {
  pending_upload: '待上传',
  in_review: '审核中',
  approved: '已通过',
  rejected: '不通过',
};

const statusColors = {
  pending_upload: '#f5f5f5',
  in_review: '#fef3c7',
  approved: '#dcfce7',
  rejected: '#fecaca',
};

const statusTextColors = {
  pending_upload: '#888',
  in_review: '#92400e',
  approved: '#16a34a',
  rejected: '#dc2626',
};

// 获取视频预签名 URL
async function getVideoUrl(key) {
  if (!key) return null;
  const { data } = await supabase.functions.invoke('get-cos-presigned-url', {
    body: { key },
  });
  return data?.url || data || null;
}

function VideoThumb({ videoKey, onExpand }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vidSize, setVidSize] = useState(null);
  const probeRef = useRef(null);

  useEffect(() => {
    if (!videoKey) { setLoading(false); return; }
    let cancelled = false;
    getVideoUrl(videoKey).then((u) => {
      if (!cancelled) { setUrl(u); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [videoKey]);

  function handleProbeMeta() {
    const v = probeRef.current;
    if (v && v.videoWidth && v.videoHeight) {
      setVidSize({ w: v.videoWidth, h: v.videoHeight });
    }
  }

  const MAX_W = 200, MAX_H = 120;
  let thumbW = MAX_W, thumbH = MAX_H;
  if (vidSize) {
    const ratio = vidSize.w / vidSize.h;
    if (ratio > MAX_W / MAX_H) {
      thumbW = MAX_W;
      thumbH = Math.round(MAX_W / ratio);
    } else {
      thumbH = MAX_H;
      thumbW = Math.round(MAX_H * ratio);
    }
  }

  if (!videoKey) return <span style={{ fontSize: 12, color: '#ccc' }}>无视频</span>;

  if (loading || !url) return <span style={{ fontSize: 12, color: '#aaa' }}>加载中...</span>;

  return (
    <div style={{ position: 'relative' }}>
      <video
        ref={probeRef}
        src={url}
        style={{ display: 'none' }}
        onLoadedMetadata={handleProbeMeta}
      />
      <video
        src={url}
        style={{
          width: thumbW, height: thumbH,
          objectFit: 'contain', borderRadius: 6,
          background: '#000', cursor: 'pointer',
        }}
        onClick={() => onExpand && onExpand(url)}
        preload="metadata"
      />
    </div>
  );
}

export default function ReviewPage() {
  const { user, isAdmin } = useAuth();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedUrl, setExpandedUrl] = useState(null);
  const [noteText, setNoteText] = useState({});
  const [editingNote, setEditingNote] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) fetchItems(selectedProject);
  }, [selectedProject]);

  async function fetchProjects() {
    const { data } = await supabase.from('projects').select('id,name').order('created_at', { ascending: false });
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
      setItems(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveNote(itemId) {
    const text = noteText[itemId];
    if (!text || !text.trim()) return;
    try {
      const item = items.find((i) => i.id === itemId);
      const notes = item.notes || [];
      const newNote = {
        id: Date.now().toString() + '_' + user.id,
        text: text.trim(),
        created_by: user.id,
        created_by_name: user.email,
        created_at: new Date().toISOString(),
      };
      await supabase
        .from('script_items')
        .update({ notes: [...notes, newNote] })
        .eq('id', itemId);
      setEditingNote(null);
      setNoteText({});
      await fetchItems(selectedProject);
    } catch (err) {
      alert('保存失败: ' + err.message);
    }
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>修改意见</h2>

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
            <span style={styles.colVideo}>视频</span>
            <span style={styles.colStatus}>审核状态</span>
            <span style={styles.colNotes}>修改意见</span>
          </div>
          {items.map((item) => (
            <div key={item.id} style={styles.row}>
              <span style={styles.colNum}>{item.script_number || '-'}</span>
              <span style={styles.colVideo}>
                <VideoThumb
                  videoKey={item.video_key}
                  onExpand={(url) => setExpandedUrl(url)}
                />
              </span>
              <span style={styles.colStatus}>
                <span style={{
                  ...styles.statusBadge,
                  background: statusColors[item.status] || '#f5f5f5',
                  color: statusTextColors[item.status] || '#888',
                }}>
                  {item.video_key
                    ? (statusLabels[item.status] || item.status)
                    : '待上传'}
                </span>
              </span>
              <span style={styles.colNotes}>
                {(item.notes || []).map((note, i) => (
                  <div key={note.id || i} style={styles.noteItem}>
                    <span style={styles.noteAuthor}>{note.created_by_name}</span>
                    <span style={styles.noteTime}>
                      {new Date(note.created_at).toLocaleString('zh-CN', {
                        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                      })}
                      {note.edited_at ? ' (已编辑)' : ''}
                    </span>
                    <p style={styles.noteText}>{note.text}</p>
                  </div>
                ))}
                {editingNote === item.id ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      style={styles.textarea}
                      value={noteText[item.id] || ''}
                      onChange={(e) => setNoteText({ ...noteText, [item.id]: e.target.value })}
                      placeholder="输入修改意见..."
                      rows={2}
                      autoFocus
                    />
                    <div style={{ marginTop: 4, display: 'flex', gap: 6 }}>
                      <button style={styles.btnMini} onClick={() => saveNote(item.id)}>保存</button>
                      <button style={styles.btnMiniGhost} onClick={() => setEditingNote(null)}>取消</button>
                    </div>
                  </div>
                ) : (
                  <button
                    style={styles.addNoteBtn}
                    onClick={() => { setEditingNote(item.id); setNoteText({ ...noteText, [item.id]: '' }); }}
                  >
                    添加意见
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 大屏播放 */}
      {expandedUrl && (
        <div style={styles.overlay} onClick={() => setExpandedUrl(null)}>
          <div style={styles.expandedWrap} onClick={(e) => e.stopPropagation()}>
            <button style={styles.closeBtn} onClick={() => setExpandedUrl(null)}>✕</button>
            <video
              src={expandedUrl}
              controls
              autoPlay
              style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 8 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 900,
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
  label: { fontSize: 13, color: '#888' },
  select: {
    padding: '6px 12px', border: '1px solid #e0e0e0',
    borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff',
  },
  table: {
    background: '#fff', borderRadius: 12,
    border: '1px solid #f0f0f0', overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex', padding: '12px 16px',
    background: '#fafafa', borderBottom: '1px solid #eee',
    fontSize: 12, color: '#888', fontWeight: 500,
  },
  row: {
    display: 'flex', padding: '14px 16px',
    borderBottom: '1px solid #f5f5f5',
    alignItems: 'flex-start', fontSize: 13, gap: 8,
  },
  colNum: { width: 80, flexShrink: 0, paddingTop: 4 },
  colVideo: { width: 200, flexShrink: 0 },
  colStatus: { width: 80, flexShrink: 0, paddingTop: 4 },
  colNotes: { flex: 1, minWidth: 0 },

  statusBadge: {
    padding: '2px 10px', borderRadius: 10, fontSize: 12,
  },

  noteItem: {
    padding: '8px 10px', background: '#fafafa',
    borderRadius: 6, marginBottom: 6, fontSize: 12,
  },
  noteAuthor: {
    fontWeight: 500, color: '#666', marginRight: 8,
  },
  noteTime: { color: '#bbb' },
  noteText: {
    margin: '4px 0 0 0', color: '#333', lineHeight: 1.5,
  },
  addNoteBtn: {
    padding: '4px 10px', background: 'transparent',
    border: '1px solid #e0e0e0', borderRadius: 6,
    fontSize: 11, color: '#888', cursor: 'pointer', marginTop: 4,
  },
  textarea: {
    width: '100%', padding: '8px 10px',
    border: '1px solid #e0e0e0', borderRadius: 6,
    fontSize: 12, outline: 'none', resize: 'vertical',
    boxSizing: 'border-box',
  },
  btnMini: {
    padding: '4px 12px', background: '#1a1a1a', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
  btnMiniGhost: {
    padding: '4px 12px', background: '#fff', color: '#666',
    border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },

  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.85)', zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  expandedWrap: {
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute', top: -36, right: 0,
    background: 'none', border: 'none', color: '#fff',
    fontSize: 24, cursor: 'pointer', lineHeight: 1,
  },

  empty: {
    textAlign: 'center', color: '#aaa', marginTop: 60, fontSize: 14,
  },
};
