import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    fetchData();
  }, [tab]);

  async function fetchData() {
    setLoading(true);
    try {
      if (tab === 'users') {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });
        setUsers(data || []);
      } else if (tab === 'stats') {
        await fetchStats();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    // Get all script items with uploader info
    const { data: items } = await supabase
      .from('script_items')
      .select('*')
      .not('uploader_id', 'is', null);

    if (!items || items.length === 0) {
      setStats({ uploaders: [], totalVideos: 0 });
      return;
    }

    // Group by uploader
    const uploaderMap = {};
    items.forEach((item) => {
      const uid = item.uploader_id;
      if (!uploaderMap[uid]) {
        uploaderMap[uid] = {
          uploader_id: uid,
          uploader_name: item.uploader_name,
          total_uploads: 0,
          approved_count: 0,
          total_review_hours: 0,
          reviewed_count: 0,
          upload_times: [],
        };
      }
      uploaderMap[uid].total_uploads++;
      uploaderMap[uid].upload_times.push(new Date(item.updated_at));

      if (item.status === 'approved' && item.reviewed_at) {
        uploaderMap[uid].approved_count++;
        const uploadTime = new Date(item.updated_at);
        const reviewTime = new Date(item.reviewed_at);
        const hours = (reviewTime - uploadTime) / (1000 * 60 * 60);
        if (hours > 0) {
          uploaderMap[uid].total_review_hours += hours;
          uploaderMap[uid].reviewed_count++;
        }
      }
    });

    const uploaders = Object.values(uploaderMap).map((u) => ({
      ...u,
      avg_review_hours:
        u.reviewed_count > 0
          ? (u.total_review_hours / u.reviewed_count).toFixed(1)
          : null,
    }));

    setStats({ uploaders, totalVideos: items.length });
  }

  async function updateUserStatus(userId, status) {
    try {
      await supabase.from('profiles').update({ status }).eq('id', userId);
      setUsers(users.map((u) => (u.id === userId ? { ...u, status } : u)));
    } catch (err) {
      alert('更新失败: ' + err.message);
    }
  }

  async function updateUserRole(userId, role) {
    try {
      await supabase.from('profiles').update({ role }).eq('id', userId);
      setUsers(users.map((u) => (u.id === userId ? { ...u, role } : u)));
    } catch (err) {
      alert('更新失败: ' + err.message);
    }
  }

  if (!isAdmin) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>管理后台</h1>
        </div>
        <button style={styles.backBtn} onClick={() => navigate('/')}>
          ← 返回首页
        </button>
      </div>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(tab === 'users' ? styles.tabActive : {}) }}
          onClick={() => setTab('users')}
        >
          用户管理
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'stats' ? styles.tabActive : {}) }}
          onClick={() => setTab('stats')}
        >
          数据统计
        </button>
      </div>

      {loading ? (
        <p style={styles.empty}>加载中...</p>
      ) : tab === 'users' ? (
        <div style={styles.userList}>
          <div style={styles.tableHeader}>
            <div style={styles.colEmail}>邮箱</div>
            <div style={styles.colRole}>角色</div>
            <div style={styles.colStatus}>状态</div>
            <div style={styles.colTime}>注册时间</div>
            <div style={styles.colAction}>操作</div>
          </div>
          {users.map((u) => (
            <div key={u.id} style={styles.userRow}>
              <div style={styles.colEmail}>{u.email}</div>
              <div style={styles.colRole}>
                <span style={styles.badge}>
                  {u.role === 'admin' ? '管理员' : '上传者'}
                </span>
              </div>
              <div style={styles.colStatus}>
                <span
                  style={{
                    ...styles.badge,
                    background: u.status === 'approved' ? '#dcfce7' : '#fef3c7',
                    color: u.status === 'approved' ? '#16a34a' : '#d97706',
                  }}
                >
                  {u.status === 'approved' ? '已通过' : '待审核'}
                </span>
              </div>
              <div style={styles.colTime}>
                {new Date(u.created_at).toLocaleDateString('zh-CN')}
              </div>
              <div style={styles.colAction}>
                {u.status === 'pending' && (
                  <button
                    style={styles.approveBtn}
                    onClick={() => updateUserStatus(u.id, 'approved')}
                  >
                    通过
                  </button>
                )}
                {u.role !== 'admin' && (
                  <button
                    style={styles.promoteBtn}
                    onClick={() => updateUserRole(u.id, 'admin')}
                  >
                    设为管理员
                  </button>
                )}
                {u.role === 'admin' && u.id !== users[0]?.id && (
                  <button
                    style={styles.demoteBtn}
                    onClick={() => updateUserRole(u.id, 'uploader')}
                  >
                    取消管理员
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.statsContainer}>
          <div style={styles.statsOverview}>
            <div style={styles.statCard}>
              <div style={styles.statNumber}>{stats?.totalVideos || 0}</div>
              <div style={styles.statLabel}>总视频数</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statNumber}>{stats?.uploaders?.length || 0}</div>
              <div style={styles.statLabel}>上传者数</div>
            </div>
          </div>

          <h3 style={styles.sectionTitle}>上传者统计</h3>
          {stats?.uploaders?.length === 0 ? (
            <p style={styles.empty}>暂无数据</p>
          ) : (
            <div style={styles.userList}>
              <div style={styles.tableHeader}>
                <div style={styles.colEmail}>上传者</div>
                <div style={styles.colRole}>上传数</div>
                <div style={styles.colStatus}>审核通过</div>
                <div style={styles.colTime}>平均审核时效</div>
              </div>
              {stats?.uploaders?.map((u, i) => (
                <div key={i} style={styles.userRow}>
                  <div style={styles.colEmail}>{u.uploader_name}</div>
                  <div style={styles.colRole}>{u.total_uploads}</div>
                  <div style={styles.colStatus}>{u.approved_count}</div>
                  <div style={styles.colTime}>
                    {u.avg_review_hours ? `${u.avg_review_hours} 小时` : '-'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 960, margin: '0 auto', padding: '40px 24px' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 32,
  },
  title: { fontSize: 28, fontWeight: 600, color: '#1a1a1a', margin: 0 },
  backBtn: {
    padding: '8px 16px', background: '#f5f5f5', border: '1px solid #e0e0e0',
    borderRadius: 8, fontSize: 13, color: '#555', cursor: 'pointer',
  },
  tabs: { display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #eee' },
  tab: {
    padding: '10px 20px', background: 'transparent', border: 'none',
    fontSize: 14, color: '#888', cursor: 'pointer', borderBottom: '2px solid transparent',
    marginBottom: -1,
  },
  tabActive: { color: '#1a1a1a', fontWeight: 600, borderBottomColor: '#1a1a1a' },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 60, fontSize: 14 },

  // Users table
  userList: { border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' },
  tableHeader: {
    display: 'flex', padding: '14px 16px', background: '#fafafa',
    borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 600, color: '#888',
  },
  userRow: {
    display: 'flex', padding: '16px', borderBottom: '1px solid #f5f5f5',
    alignItems: 'center', fontSize: 13,
  },
  colEmail: { flex: 1 },
  colRole: { width: 100 },
  colStatus: { width: 100 },
  colTime: { width: 120 },
  colAction: { width: 200, display: 'flex', gap: 6, justifyContent: 'flex-end' },
  badge: {
    padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500,
    background: '#f5f5f5', color: '#666',
  },
  approveBtn: {
    padding: '4px 10px', background: '#16a34a', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
  promoteBtn: {
    padding: '4px 10px', background: '#1a1a1a', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },
  demoteBtn: {
    padding: '4px 10px', background: 'transparent', border: '1px solid #fecaca',
    borderRadius: 6, color: '#dc2626', fontSize: 12, cursor: 'pointer',
  },

  // Stats
  statsContainer: {},
  statsOverview: { display: 'flex', gap: 16, marginBottom: 32 },
  statCard: {
    flex: 1, padding: '24px', background: '#fff', borderRadius: 12,
    border: '1px solid #f0f0f0', textAlign: 'center',
  },
  statNumber: { fontSize: 36, fontWeight: 700, color: '#1a1a1a' },
  statLabel: { fontSize: 13, color: '#888', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', margin: '0 0 16px 0' },
};
