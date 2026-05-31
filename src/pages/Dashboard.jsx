import { useState, useEffect, useContext } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { user, profile, isAdmin, username } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      let query = supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (!isAdmin) {
        query = query.eq('created_by', user.id);
      }
      const { data } = await query;
      setProjects(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({ name: newProjectName.trim(), created_by: user.id })
        .select()
        .single();

      if (error) throw error;
      setProjects([data, ...projects]);
      setNewProjectName('');
      setShowCreate(false);
    } catch (err) {
      alert('创建失败: ' + err.message);
    }
  }

  async function deleteProject(id) {
    if (!confirm('确定删除该项目？所有相关数据将被永久删除。')) return;
    try {
      await supabase.from('projects').delete().eq('id', id);
      setProjects(projects.filter((p) => p.id !== id));
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>项目管理</h1>
          <p style={styles.subtitle}>
            {isAdmin ? '管理员' : '上传者'} · {profile?.email || user?.email}
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.logoutBtn}
            onClick={() => supabase.auth.signOut()}
          >
            退出登录
          </button>
          {isAdmin && (
            <>
              <button
                style={styles.primaryBtn}
                onClick={() => navigate('/admin')}
              >
                管理后台
              </button>
              <button
                style={styles.primaryBtn}
                onClick={() => setShowCreate(true)}
              >
                新建项目
              </button>
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <div style={styles.createBar}>
          <input
            style={styles.input}
            placeholder="输入项目名称"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createProject()}
            autoFocus
          />
          <button style={styles.btnSmall} onClick={createProject}>确定</button>
          <button style={styles.btnSmallGhost} onClick={() => setShowCreate(false)}>取消</button>
        </div>
      )}

      {loading ? (
        <p style={styles.empty}>加载中...</p>
      ) : projects.length === 0 ? (
        <p style={styles.empty}>暂无项目，请管理员创建</p>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <div
              key={p.id}
              style={styles.card}
              onClick={() => navigate(`/project/${p.id}`)}
            >
              <div style={styles.cardBody}>
                <h3 style={styles.cardTitle}>{p.name}</h3>
                <p style={styles.cardMeta}>
                  创建于 {new Date(p.created_at).toLocaleDateString('zh-CN')}
                </p>
              </div>
              {isAdmin && (
                <button
                  style={styles.deleteBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteProject(p.id);
                  }}
                >
                  删除
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '40px 24px',
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 32,
    flexWrap: 'wrap',
    gap: 16,
  },
  headerActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 28,
    fontWeight: 600,
    color: '#1a1a1a',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    margin: '4px 0 0 0',
  },
  logoutBtn: {
    padding: '8px 16px',
    background: '#f5f5f5',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    fontSize: 13,
    color: '#666',
    cursor: 'pointer',
  },
  primaryBtn: {
    padding: '8px 16px',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  createBar: {
    display: 'flex',
    gap: 8,
    marginBottom: 24,
    padding: '16px 20px',
    background: '#fafafa',
    borderRadius: 12,
    border: '1px solid #eee',
  },
  input: {
    flex: 1,
    padding: '8px 14px',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
  },
  btnSmall: {
    padding: '8px 16px',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnSmallGhost: {
    padding: '8px 16px',
    background: '#fff',
    color: '#666',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    background: '#fff',
    borderRadius: 12,
    border: '1px solid #f0f0f0',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
    margin: 0,
  },
  cardMeta: {
    fontSize: 12,
    color: '#aaa',
    margin: '4px 0 0 0',
  },
  deleteBtn: {
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid #fecaca',
    borderRadius: 6,
    color: '#dc2626',
    fontSize: 12,
    cursor: 'pointer',
    marginLeft: 16,
  },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    marginTop: 60,
    fontSize: 14,
  },
};
