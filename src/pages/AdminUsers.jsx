import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

const PERMISSIONS = [
  { key: 'view_project', label: '查看项目' },
  { key: 'upload_video', label: '上传视频' },
  { key: 'edit_notes', label: '编辑修改意见' },
  { key: 'delete_notes', label: '删除修改意见' },
  { key: 'review', label: '标记通过/不通过' },
  { key: 'delete_item', label: '删除脚本条目' },
];

export default function AdminUsers() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [userPerms, setUserPerms] = useState({});
  // { [userId]: { [projectId]: 'admin' | 'member' } }
  const [userMemberships, setUserMemberships] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/');
      return;
    }
    fetchData();
  }, [isAdmin]);

  async function fetchData() {
    setLoading(true);
    try {
      const [usersRes, projRes, membersRes, permsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('*').order('name'),
        supabase.from('project_members').select('*'),
        supabase.from('user_permissions').select('*'),
      ]);

      setUsers(usersRes.data || []);
      setProjects(projRes.data || []);

      // project_members: { [userId]: { [projectId]: role } }
      const membersMap = {};
      (membersRes.data || []).forEach((m) => {
        if (!membersMap[m.user_id]) membersMap[m.user_id] = {};
        membersMap[m.user_id][m.project_id] = m.role || 'member';
      });
      setUserMemberships(membersMap);

      // user_permissions: { [userId]: { [projectId]: [perm1, perm2, ...] } }
      const permsMap = {};
      (permsRes.data || []).forEach((p) => {
        if (!permsMap[p.user_id]) permsMap[p.user_id] = {};
        if (!permsMap[p.user_id][p.project_id]) permsMap[p.user_id][p.project_id] = [];
        permsMap[p.user_id][p.project_id].push(p.permission);
      });
      setUserPerms(permsMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(user) {
    try {
      await supabase
        .from('profiles')
        .update({ status: 'approved' })
        .eq('id', user.id);

      // 默认加入所有项目为普通成员
      for (const proj of projects) {
        await supabase.from('project_members').upsert({
          project_id: proj.id,
          user_id: user.id,
          role: 'member',
        }, { onConflict: 'project_id,user_id' });

        await supabase.from('user_permissions').upsert({
          user_id: user.id,
          project_id: proj.id,
          permission: 'view_project',
        }, { onConflict: 'user_id,project_id,permission' });
      }

      await fetchData();
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  }

  async function handleReject(userId) {
    if (!confirm('确定拒绝该账号？')) return;
    try {
      await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId);
      await fetchData();
    } catch (err) {
      alert('操作失败: ' + err.message);
    }
  }

  async function savePermissions(userId) {
    setSaving(true);
    try {
      const members = userMemberships[userId] || {};
      const perms = userPerms[userId] || {};

      // 重建 project_members
      await supabase.from('project_members').delete().eq('user_id', userId);
      for (const [pid, role] of Object.entries(members)) {
        await supabase.from('project_members').insert({
          project_id: pid,
          user_id: userId,
          role: role,
        });
      }

      // 重建 user_permissions
      await supabase.from('user_permissions').delete().eq('user_id', userId);
      for (const [pid, permList] of Object.entries(perms)) {
        for (const perm of permList) {
          await supabase.from('user_permissions').insert({
            user_id: userId,
            project_id: pid || null,
            permission: perm,
          });
        }
      }

      setEditingUser(null);
      await fetchData();
      alert('保存成功');
    } catch (err) {
      alert('保存失败: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleMembership(userId, projectId) {
    setUserMemberships((prev) => {
      const userM = { ...(prev[userId] || {}) };
      if (userM[projectId]) {
        delete userM[projectId];
      } else {
        userM[projectId] = 'member';
      }
      return { ...prev, [userId]: userM };
    });
  }

  function setRole(userId, projectId, role) {
    setUserMemberships((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] || {}), [projectId]: role },
    }));
  }

  function togglePermission(userId, projectId, permKey) {
    setUserPerms((prev) => {
      const userP = prev[userId] || {};
      const projP = userP[projectId] || [];
      const nextProjP = projP.includes(permKey)
        ? projP.filter((p) => p !== permKey)
        : [...projP, permKey];
      return { ...prev, [userId]: { ...userP, [projectId]: nextProjP } };
    });
  }

  if (loading) return <div style={s.loading}>加载中...</div>;

  return (
    <div style={s.container}>
      <h1 style={s.title}>账号管理</h1>
      <p style={s.subtitle}>审核注册申请、分配项目权限 · 主账号看全部，项目管理员看该项目全部，普通成员只看自己上传</p>

      <div style={s.table}>
        <div style={s.theader}>
          <div style={s.th}>邮箱</div>
          <div style={s.th}>用户名</div>
          <div style={s.th}>角色</div>
          <div style={s.th}>状态</div>
          <div style={s.th}>备注</div>
          <div style={s.th}>操作</div>
        </div>

        {users.map((u) => (
          <div key={u.id}>
            <div style={s.trow}>
              <div style={s.td}>{u.email}</div>
              <div style={s.td}>{u.username || '-'}</div>
              <div style={s.td}>
                <span style={s.roleBadge(u.role)}>
                  {u.role === 'admin' ? '主账号' : '普通账号'}
                </span>
              </div>
              <div style={s.td}>
                <span style={s.statusBadge(u.status)}>
                  {u.status === 'pending' ? '待审核' : u.status === 'approved' ? '已通过' : '已拒绝'}
                </span>
              </div>
              <div style={s.td}>{u.remark || '-'}</div>
              <div style={s.td}>
                <div style={s.actions}>
                  {u.status === 'pending' && (
                    <>
                      <button style={s.btnApprove} onClick={() => handleApprove(u)}>通过</button>
                      <button style={s.btnReject} onClick={() => handleReject(u.id)}>拒绝</button>
                    </>
                  )}
                  {u.status === 'approved' && u.role !== 'admin' && (
                    <button style={s.btnEdit} onClick={() => setEditingUser(u)}>权限配置</button>
                  )}
                </div>
              </div>
            </div>

            {editingUser?.id === u.id && (
              <div style={s.editPanel}>
                <h3 style={s.editTitle}>配置「{u.username || u.email}」的权限</h3>
                <div style={s.remarkRow}>
                  <label style={s.label}>备注：</label>
                  <input
                    style={s.input}
                    defaultValue={u.remark || ''}
                    onBlur={async (e) => {
                      const v = e.target.value;
                      await supabase.from('profiles').update({ remark: v }).eq('id', u.id);
                      setUsers(users.map((x) => x.id === u.id ? { ...x, remark: v } : x));
                    }}
                    placeholder="备注信息"
                  />
                </div>

                <h4 style={s.sectionTitle}>项目分配与角色</h4>
                {projects.map((proj) => {
                  const memberRole = (userMemberships[u.id] || {})[proj.id];
                  const isMember = !!memberRole;
                  return (
                    <div key={proj.id} style={s.projRow}>
                      <div style={s.projHeader}>
                        <label style={s.checkLabel}>
                          <input
                            type="checkbox"
                            checked={isMember}
                            onChange={() => toggleMembership(u.id, proj.id)}
                          />
                          <span style={s.projName}>{proj.name}</span>
                        </label>

                        {isMember && (
                          <select
                            style={s.roleSelect}
                            value={memberRole}
                            onChange={(e) => setRole(u.id, proj.id, e.target.value)}
                          >
                            <option value="member">普通成员（只看自己上传）</option>
                            <option value="admin">项目管理员（看全部）</option>
                          </select>
                        )}
                      </div>

                      {isMember && (
                        <div style={s.permGrid}>
                          {PERMISSIONS.map((p) => {
                            const checked = (userPerms[u.id]?.[proj.id] || []).includes(p.key);
                            return (
                              <label key={p.key} style={s.permLabel}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePermission(u.id, proj.id, p.key)}
                                />
                                {p.label}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={s.editActions}>
                  <button style={s.btnSave} disabled={saving} onClick={() => savePermissions(u.id)}>
                    {saving ? '保存中...' : '保存'}
                  </button>
                  <button style={s.btnCancel} onClick={() => { setEditingUser(null); fetchData(); }}>取消</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  container: { maxWidth: 1100, margin: '0 auto', padding: '40px 24px' },
  title: { fontSize: 24, fontWeight: 600, color: '#1a1a1a', margin: 0 },
  subtitle: { fontSize: 13, color: '#888', margin: '4px 0 24px 0' },
  loading: { textAlign: 'center', color: '#aaa', marginTop: 60 },
  table: { border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  theader: { display: 'flex', padding: '14px 16px', background: '#fafafa', borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 600, color: '#888' },
  th: { flex: 1, minWidth: 100 },
  trow: { display: 'flex', padding: '12px 16px', borderBottom: '1px solid #f5f5f5', fontSize: 13, alignItems: 'center' },
  td: { flex: 1, minWidth: 100 },
  roleBadge: (role) => ({ padding: '2px 8px', borderRadius: 4, fontSize: 12, background: role === 'admin' ? '#dbeafe' : '#f5f5f5', color: role === 'admin' ? '#1d4ed8' : '#555' }),
  statusBadge: (status) => ({
    padding: '2px 8px', borderRadius: 4, fontSize: 12,
    background: status === 'approved' ? '#dcfce7' : status === 'pending' ? '#fef3c7' : '#fee2e2',
    color: status === 'approved' ? '#16a34a' : status === 'pending' ? '#d97706' : '#dc2626',
  }),
  actions: { display: 'flex', gap: 6 },
  btnApprove: { padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  btnReject: { padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  btnEdit: { padding: '4px 12px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  editPanel: { padding: '20px 24px', background: '#fafafa', borderTop: '1px solid #eee', fontSize: 13 },
  editTitle: { fontSize: 15, fontWeight: 600, margin: '0 0 12px 0' },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: '#555', margin: '12px 0 8px 0' },
  remarkRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  label: { fontSize: 13, color: '#555', fontWeight: 500 },
  input: { flex: 1, padding: '6px 10px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13, outline: 'none' },
  projRow: { marginBottom: 10, padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #eee' },
  projHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  projName: { fontWeight: 500 },
  roleSelect: {
    padding: '2px 8px', border: '1px solid #e0e0e0', borderRadius: 4,
    fontSize: 12, outline: 'none', background: '#fff',
  },
  permGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, marginLeft: 24 },
  permLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', cursor: 'pointer' },
  editActions: { display: 'flex', gap: 8, marginTop: 16 },
  btnSave: { padding: '6px 16px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
  btnCancel: { padding: '6px 16px', background: '#fff', color: '#666', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13, cursor: 'pointer' },
};
