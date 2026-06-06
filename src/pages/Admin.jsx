import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const { isAdmin, profile, user } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingUsername, setEditingUsername] = useState(null);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dateId, setDateId] = useState('');
  const [projects, setProjects] = useState([]);
  const [shootDates, setShootDates] = useState([]);
  const [detailStats, setDetailStats] = useState([]);
  // 拍摄时长录入
  const [showShootModal, setShowShootModal] = useState(false);
  const [shootForm, setShootForm] = useState({ userId: '', shootDate: '', hours: '', minutes: '', notes: '' });
  const [shootUsers, setShootUsers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    fetchData();
  }, [tab]);

  // 打开拍摄时长录入弹窗时，加载上传者列表
  useEffect(() => {
    if (showShootModal) {
      supabase
        .from('profiles')
        .select('id, username, email, role')
        .then(({ data }) => setShootUsers(data || []));
      setShootForm({ userId: '', shootDate: '', hours: '', minutes: '', notes: '' });
    }
  }, [showShootModal]);

  // 进入数据统计页时加载项目列表
  useEffect(() => {
    if (tab === 'stats') {
      supabase
        .from('projects')
        .select('id, name')
        .order('created_at', { ascending: false })
        .then(({ data }) => setProjects(data || []));
    }
  }, [tab]);

  // 选择项目后加载拍摄日期
  useEffect(() => {
    if (projectId) {
      supabase
        .from('shoot_dates')
        .select('id, shoot_date')
        .eq('project_id', projectId)
        .order('shoot_date', { ascending: false })
        .then(({ data }) => setShootDates(data || []));
    } else {
      setShootDates([]);
    }
    setDateId('');
  }, [projectId]);

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
    // 构建查询
    let query = supabase
      .from('script_items')
      .select('*')
      .not('uploader_id', 'is', null);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (dateId) {
      query = query.eq('date_id', dateId);
    }

    const { data: items } = await query;

    if (!items || items.length === 0) {
      setStats({ uploaders: [], totalVideos: 0 });
      setDetailStats([]);
      return;
    }

    // 获取用户信息
    const uploaderIds = [...new Set(items.map((i) => i.uploader_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, email')
      .in('id', uploaderIds);
    const profileMap = {};
    (profiles || []).forEach((p) => { profileMap[p.id] = p; });

    // 获取项目、拍摄日期名称
    const projectIds = [...new Set(items.map((i) => i.project_id).filter(Boolean))];
    const dateIds = [...new Set(items.map((i) => i.date_id).filter(Boolean))];
    const [projRes, dateRes] = await Promise.all([
      projectIds.length
        ? supabase.from('projects').select('id, name').in('id', projectIds)
        : Promise.resolve({ data: [] }),
      dateIds.length
        ? supabase.from('shoot_dates').select('id, shoot_date').in('id', dateIds)
        : Promise.resolve({ data: [] }),
    ]);
    const projectMap = {};
    (projRes.data || []).forEach((p) => { projectMap[p.id] = p.name; });
    const dateMap = {};
    (dateRes.data || []).forEach((d) => { dateMap[d.id] = d.shoot_date; });

    // 汇总上传者统计
    const uploaderTotalMap = {};

    items.forEach((item) => {
      const uid = item.uploader_id;
      const prof = profileMap[uid] || {};

      if (!uploaderTotalMap[uid]) {
        uploaderTotalMap[uid] = {
          uploader_id: uid,
          uploader_name: item.uploader_name || '',
          username: prof.username || '',
          email: prof.email || '',
          total_uploads: 0,
          approved_count: 0,
          total_review_hours: 0,
          reviewed_count: 0,
        };
      }
      uploaderTotalMap[uid].total_uploads++;
      if (item.status === 'approved' && item.reviewed_at) {
        uploaderTotalMap[uid].approved_count++;
        const uploadTime = new Date(item.updated_at);
        const reviewTime = new Date(item.reviewed_at);
        const hours = (reviewTime - uploadTime) / (1000 * 60 * 60);
        if (hours > 0) {
          uploaderTotalMap[uid].total_review_hours += hours;
          uploaderTotalMap[uid].reviewed_count++;
        }
      }
    });

    const uploaders = Object.values(uploaderTotalMap).map((u) => ({
      ...u,
      avg_review_hours:
        u.reviewed_count > 0
          ? (u.total_review_hours / u.reviewed_count).toFixed(1)
          : null,
    }));

    // 按项目-拍摄日期-上传者 分组明细
    const detailMap = {};
    items.forEach((item) => {
      const pid = item.project_id || 'unknown';
      const did = item.date_id || 'unknown';
      const uid = item.uploader_id;
      const key = `${pid}_${did}`;
      const prof = profileMap[uid] || {};

      if (!detailMap[key]) {
        detailMap[key] = {
          projectId: pid,
          projectName: projectMap[pid] || '未关联项目',
          dateId: did,
          dateName: dateMap[did] || '',
          uploaders: {},
        };
      }

      if (!detailMap[key].uploaders[uid]) {
        detailMap[key].uploaders[uid] = {
          uploader_id: uid,
          uploader_name: item.uploader_name || '',
          username: prof.username || '',
          email: prof.email || '',
          uploads: 0,
          approved: 0,
          total_review_hours: 0,
          reviewed_count: 0,
        };
      }
      detailMap[key].uploaders[uid].uploads++;
      if (item.status === 'approved' && item.reviewed_at) {
        detailMap[key].uploaders[uid].approved++;
        const uploadTime = new Date(item.updated_at);
        const reviewTime = new Date(item.reviewed_at);
        const hours = (reviewTime - uploadTime) / (1000 * 60 * 60);
        if (hours > 0) {
          detailMap[key].uploaders[uid].total_review_hours += hours;
          detailMap[key].uploaders[uid].reviewed_count++;
        }
      }
    });

    const detail = Object.values(detailMap).map((d) => ({
      ...d,
      uploaderRows: Object.values(d.uploaders).map((u) => ({
        ...u,
        avg_review_hours:
          u.reviewed_count > 0
            ? (u.total_review_hours / u.reviewed_count).toFixed(1)
            : null,
      })),
    }));

    // 按项目名、日期名排序
    detail.sort((a, b) => {
      if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName);
      return (b.dateName || '').localeCompare(a.dateName || '');
    });

    // 查询拍摄时长（shooting_records）——不过滤项目/日期，只按用户汇总
    const { data: shootData } = await supabase
      .from('shooting_records')
      .select('user_id, duration');

    const shootMap = {};
    (shootData || []).forEach((r) => {
      shootMap[r.user_id] = (shootMap[r.user_id] || 0) + r.duration;
    });

    // 挂到 uploaders
    uploaders.forEach((u) => {
      const mins = shootMap[u.uploader_id] || 0;
      u.shoot_hours = mins > 0 ? (mins / 60).toFixed(1) : null;
    });

    // 挂到 detailStats
    detail.forEach((d) => {
      d.uploaderRows.forEach((u) => {
        const mins = shootMap[u.uploader_id] || 0;
        u.shoot_hours = mins > 0 ? (mins / 60).toFixed(1) : null;
      });
    });

    setStats({ uploaders, totalVideos: items.length });
    setDetailStats(detail);
  }

  async function saveShootRecord() {
    const { userId, shootDate, hours, minutes, notes } = shootForm;
    if (!userId || !shootDate) {
      alert('请选择用户和日期');
      return;
    }
    const h = parseInt(hours) || 0;
    const m = parseInt(minutes) || 0;
    if (h === 0 && m === 0) {
      alert('请输入拍摄时长');
      return;
    }
    const duration = h * 60 + m;
    const { error } = await supabase
      .from('shooting_records')
      .insert({ user_id: userId, shoot_date: shootDate, duration, notes: notes.trim() || null });
    if (error) {
      alert('保存失败: ' + error.message);
      return;
    }
    setShowShootModal(false);
    alert('保存成功！');
    if (tab === 'stats') {
      setLoading(true);
      fetchStats();
    }
  }

  async function updateUserStatus(userId, status) {
    const { error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', userId);
    if (error) {
      alert('更新失败: ' + error.message);
      return;
    }
    setUsers(users.map((u) => (u.id === userId ? { ...u, status } : u)));
  }

  async function updateUserRole(userId, role) {
    // 防止自己取消自己的管理员权限（至少保留一个管理员）
    if (role !== 'admin' && userId === profile?.id) {
      const admins = users.filter((u) => u.role === 'admin');
      if (admins.length <= 1) {
        alert('系统中必须至少保留一个管理员');
        return;
      }
    }
    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);
    if (error) {
      alert('更新失败: ' + error.message);
      return;
    }
    setUsers(users.map((u) => (u.id === userId ? { ...u, role } : u)));
  }

  async function deleteUser(userId) {
    const target = users.find((u) => u.id === userId);
    const isSelf = userId === profile?.id;
    if (isSelf) {
      alert('不能删除自己的账号');
      return;
    }
    if (!window.confirm(`确定要删除账号 "${target?.email || target?.username || userId}" 吗？\n\n删除后该用户将无法登录，此操作不可撤销。`)) return;
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (error) {
      alert('删除失败: ' + error.message);
      return;
    }
    setUsers(users.filter((u) => u.id !== userId));
  }

  function startEditUsername(u) {
    setEditingUsername(u.id);
    setUsernameDraft(u.username || '');
  }

  function cancelEditUsername() {
    setEditingUsername(null);
    setUsernameDraft('');
  }

  async function saveUsername(userId) {
    const { error } = await supabase
      .from('profiles')
      .update({ username: usernameDraft.trim() })
      .eq('id', userId);
    if (error) {
      alert('修改失败: ' + error.message);
      return;
    }
    setUsers(users.map((u) => (u.id === userId ? { ...u, username: usernameDraft.trim() } : u)));
    setEditingUsername(null);
    setUsernameDraft('');
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
              <div style={styles.colEmail}>
                <span>{u.email}</span>
                {editingUsername === u.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <input
                      style={styles.usernameInput}
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      placeholder="输入用户名"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') saveUsername(u.id); if (e.key === 'Escape') cancelEditUsername(); }}
                    />
                    <button style={styles.saveBtn} onClick={() => saveUsername(u.id)}>保存</button>
                    <button style={styles.cancelBtn} onClick={cancelEditUsername}>取消</button>
                  </div>
                ) : (
                  <span>
                    {u.username ? (
                      <span style={{ color: '#888', fontSize: 12, marginLeft: 6 }}>({u.username})</span>
                    ) : (
                      <span style={{ color: '#ccc', fontSize: 12, marginLeft: 6 }}>(未设置)</span>
                    )}
                  </span>
                )}
              </div>
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
                  <>
                    <button
                      style={styles.promoteBtn}
                      onClick={() => updateUserRole(u.id, 'admin')}
                    >
                      设为管理员
                    </button>
                    {editingUsername !== u.id && (
                      <button
                        style={styles.editNameBtn}
                        onClick={() => startEditUsername(u)}
                      >
                        修改用户名
                      </button>
                    )}
                  </>
                )}
                {u.role === 'admin' && u.id !== (profile?.id || user?.id) && (
                  <button
                    style={styles.demoteBtn}
                    onClick={() => updateUserRole(u.id, 'uploader')}
                  >
                    取消管理员
                  </button>
                )}
                {u.id !== (profile?.id || user?.id) && (
                  <button
                    style={styles.deleteBtn}
                    onClick={() => deleteUser(u.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.statsContainer}>
          {/* 项目 + 拍摄日期筛选 */}
          <div style={styles.filterBar}>
            <span style={styles.filterLabel}>项目</span>
            <select
              style={styles.formSelect}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <span style={styles.filterLabel}>拍摄日期</span>
            <select
              style={{ ...styles.formSelect, minWidth: 140 }}
              value={dateId}
              onChange={(e) => setDateId(e.target.value)}
              disabled={!projectId}
            >
              <option value="">全部日期</option>
              {shootDates.map((d) => (
                <option key={d.id} value={d.id}>{d.shoot_date}</option>
              ))}
            </select>
            <button style={styles.filterBtn} onClick={() => { setLoading(true); fetchStats(); }}>
              查询
            </button>
            {(projectId || dateId) && (
              <button style={styles.filterClearBtn} onClick={() => { setProjectId(''); setDateId(''); setLoading(true); fetchStats(); }}>
                清除筛选
              </button>
            )}
            <button style={styles.shootBtn} onClick={() => setShowShootModal(true)}>
              + 录入拍摄时长
            </button>
          </div>

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
                <div style={styles.colShoot}>拍摄时长(h)</div>
                <div style={styles.colTime}>平均审核时效</div>
              </div>
              {stats?.uploaders?.map((u, i) => (
                <div key={i} style={styles.userRow}>
                  <div style={styles.colEmail}>
                    <div>{u.uploader_name}</div>
                    {(u.username || u.email) && (
                      <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                        {u.username || u.email}
                      </div>
                    )}
                  </div>
                  <div style={styles.colRole}>{u.total_uploads}</div>
                  <div style={styles.colStatus}>{u.approved_count}</div>
                  <div style={styles.colShoot}>
                    {u.shoot_hours ? `${u.shoot_hours}h` : '-'}
                  </div>
                  <div style={styles.colTime}>
                    {u.avg_review_hours ? `${u.avg_review_hours} 小时` : '-'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 按项目-拍摄日期-上传者 明细统计 */}
          {detailStats.length > 0 && (
            <>
              <h3 style={styles.sectionTitle}>明细统计</h3>
              {detailStats.map((d) => (
                <div key={`${d.projectId}_${d.dateId}`} style={styles.monthSection}>
                  <div style={styles.monthHeader}>
                    {d.projectName}
                    {d.dateName && <span style={{ color: '#888', fontWeight: 400, marginLeft: 8 }}>{d.dateName}</span>}
                  </div>
                  <div style={styles.userList}>
                    <div style={styles.tableHeader}>
                      <div style={styles.colEmail}>上传者</div>
                      <div style={styles.colRole}>上传数</div>
                      <div style={styles.colStatus}>通过数</div>
                      <div style={styles.colShoot}>拍摄时长(h)</div>
                      <div style={styles.colTime}>平均审核时效</div>
                    </div>
                    {d.uploaderRows.map((u, i) => (
                      <div key={i} style={styles.userRow}>
                        <div style={styles.colEmail}>
                          <div>{u.uploader_name}</div>
                          {(u.username || u.email) && (
                            <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                              {u.username || u.email}
                            </div>
                          )}
                        </div>
                        <div style={styles.colRole}>{u.uploads}</div>
                        <div style={styles.colStatus}>{u.approved}</div>
                        <div style={styles.colShoot}>
                          {u.shoot_hours ? `${u.shoot_hours}h` : '-'}
                        </div>
                        <div style={styles.colTime}>
                          {u.avg_review_hours ? `${u.avg_review_hours} 小时` : '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 拍摄时长录入弹窗 */}
      {showShootModal && (
        <div style={styles.modalOverlay} onClick={() => setShowShootModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>录入拍摄时长</h3>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>拍摄者</label>
              <select
                style={styles.formSelect}
                value={shootForm.userId}
                onChange={(e) => setShootForm({ ...shootForm, userId: e.target.value })}
              >
                <option value="">-- 请选择 --</option>
                {shootUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username || u.email} ({u.role === 'admin' ? '管理员' : '上传者'})
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>拍摄日期</label>
              <input
                type="date"
                style={styles.formInput}
                value={shootForm.shootDate}
                onChange={(e) => setShootForm({ ...shootForm, shootDate: e.target.value })}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>拍摄时长</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number" min="0"
                  style={{ ...styles.formInput, width: 80 }}
                  placeholder="小时"
                  value={shootForm.hours}
                  onChange={(e) => setShootForm({ ...shootForm, hours: e.target.value })}
                />
                <span>小时</span>
                <input
                  type="number" min="0" max="59"
                  style={{ ...styles.formInput, width: 80 }}
                  placeholder="分钟"
                  value={shootForm.minutes}
                  onChange={(e) => setShootForm({ ...shootForm, minutes: e.target.value })}
                />
                <span>分钟</span>
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>备注（可选）</label>
              <input
                type="text"
                style={styles.formInput}
                placeholder="备注信息"
                value={shootForm.notes}
                onChange={(e) => setShootForm({ ...shootForm, notes: e.target.value })}
              />
            </div>
            <div style={styles.modalActions}>
              <button style={styles.filterBtn} onClick={saveShootRecord}>保存</button>
              <button style={styles.filterClearBtn} onClick={() => setShowShootModal(false)}>取消</button>
            </div>
          </div>
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
  colAction: { width: 260, display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' },
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
  deleteBtn: {
    padding: '4px 10px', background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 6, color: '#dc2626', fontSize: 12, cursor: 'pointer',
  },
  editNameBtn: {
    padding: '4px 10px', background: '#f0f9ff', border: '1px solid #bfdbfe',
    borderRadius: 6, color: '#2563eb', fontSize: 12, cursor: 'pointer',
  },
  usernameInput: {
    padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4,
    fontSize: 12, outline: 'none', width: 100,
  },
  saveBtn: {
    padding: '3px 8px', background: '#16a34a', color: '#fff',
    border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
  },
  cancelBtn: {
    padding: '3px 8px', background: '#fff', color: '#666',
    border: '1px solid #e0e0e0', borderRadius: 4, fontSize: 11, cursor: 'pointer',
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

  // 筛选
  filterBar: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24,
    padding: '12px 16px', background: '#fff', borderRadius: 12,
    border: '1px solid #eee', flexWrap: 'wrap',
  },
  filterLabel: { fontSize: 13, color: '#888', whiteSpace: 'nowrap' },
  filterBtn: {
    padding: '6px 16px', background: '#1a1a1a', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer',
  },
  filterClearBtn: {
    padding: '6px 12px', background: '#fff', color: '#888',
    border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  },

  // 明细统计
  monthSection: { marginBottom: 24 },
  monthHeader: {
    fontSize: 14, fontWeight: 600, color: '#1a1a1a',
    padding: '8px 16px', background: '#f9fafb', borderRadius: 8,
    marginBottom: 8, borderLeft: '3px solid #1a1a1a',
  },

  // 拍摄时长
  colShoot: { width: 110 },
  shootBtn: {
    padding: '6px 16px', background: '#f0f9ff', color: '#2563eb',
    border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, cursor: 'pointer',
    marginLeft: 'auto',
  },

  // 弹窗
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 16, padding: '32px', width: 420,
    maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalTitle: {
    fontSize: 18, fontWeight: 600, color: '#1a1a1a', margin: '0 0 24px 0',
  },
  formGroup: { marginBottom: 16 },
  formLabel: {
    display: 'block', fontSize: 13, fontWeight: 500, color: '#555',
    marginBottom: 6,
  },
  formInput: {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: 8, fontSize: 14, outline: 'none', color: '#1a1a1a',
    boxSizing: 'border-box',
  },
  formSelect: {
    padding: '6px 10px', border: '1px solid #d1d5db',
    borderRadius: 6, fontSize: 13, outline: 'none', color: '#1a1a1a',
    background: '#fff',
  },
  modalActions: {
    display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24,
  },
};
