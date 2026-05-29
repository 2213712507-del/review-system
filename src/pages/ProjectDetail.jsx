import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function ProjectDetail() {
  const { id } = useParams();
  const { isAdmin, user } = useAuth();
  const [project, setProject] = useState(null);
  const [dates, setDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newDate, setNewDate] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    setLoading(true);
    try {
      const [{ data: proj }, { data: dts }] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('shoot_dates').select('*').eq('project_id', id).order('shoot_date', { ascending: false }),
      ]);
      setProject(proj);
      setDates(dts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createDate() {
    if (!newDate) return;
    try {
      const { data, error } = await supabase
        .from('shoot_dates')
        .insert({ project_id: id, shoot_date: newDate, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      setDates([data, ...dates]);
      setNewDate('');
      setShowCreate(false);
    } catch (err) {
      alert('创建失败: ' + err.message);
    }
  }

  async function deleteDate(dateId) {
    if (!confirm('确定删除该拍摄日期？所有审片数据将被永久删除。')) return;
    try {
      await supabase.from('shoot_dates').delete().eq('id', dateId);
      setDates(dates.filter((d) => d.id !== dateId));
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }

  if (loading) return <div style={styles.loading}>加载中...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>
          ← 返回
        </button>
        <div>
          <h1 style={styles.title}>{project?.name}</h1>
          <p style={styles.subtitle}>拍摄日期列表</p>
        </div>
        {isAdmin && (
          <button style={styles.primaryBtn} onClick={() => setShowCreate(true)}>
            添加拍摄日期
          </button>
        )}
      </div>

      {showCreate && (
        <div style={styles.createBar}>
          <input
            type="date"
            style={styles.input}
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <button style={styles.btnSmall} onClick={createDate}>确定</button>
          <button style={styles.btnSmallGhost} onClick={() => setShowCreate(false)}>取消</button>
        </div>
      )}

      {dates.length === 0 ? (
        <p style={styles.empty}>暂无拍摄日期</p>
      ) : (
        <div style={styles.grid}>
          {dates.map((d) => (
            <div
              key={d.id}
              style={styles.card}
              onClick={() => navigate(`/project/${id}/date/${d.id}`)}
            >
              <div style={styles.cardBody}>
                <h3 style={styles.cardTitle}>{d.shoot_date}</h3>
                <p style={styles.cardMeta}>
                  创建于 {new Date(d.created_at).toLocaleDateString('zh-CN')}
                </p>
              </div>
              <div style={styles.cardRight}>
                <span style={styles.arrow}>→</span>
                {isAdmin && (
                  <button
                    style={styles.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteDate(d.id);
                    }}
                  >
                    删除
                  </button>
                )}
              </div>
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
  },
  loading: {
    textAlign: 'center',
    color: '#aaa',
    marginTop: 60,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    flexWrap: 'wrap',
    gap: 16,
  },
  backBtn: {
    padding: '8px 16px',
    background: '#f5f5f5',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    fontSize: 13,
    color: '#555',
    cursor: 'pointer',
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
  cardBody: { flex: 1 },
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
  cardRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  arrow: {
    fontSize: 18,
    color: '#ccc',
  },
  deleteBtn: {
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid #fecaca',
    borderRadius: 6,
    color: '#dc2626',
    fontSize: 12,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    color: '#aaa',
    marginTop: 60,
    fontSize: 14,
  },
};
