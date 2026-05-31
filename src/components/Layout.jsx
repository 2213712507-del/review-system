import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout({ children }) {
  const { user, profile, isAdmin, username, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const menu = [
    { path: '/', label: '项目概览', icon: '📁' },
    { path: '/upload', label: '视频上传', icon: '📤', needPerm: 'upload_video' },
    { path: '/review', label: '修改意见', icon: '💬', needPerm: 'upload_video' },
  ];

  const adminMenu = [
    { path: '/admin-users', label: '账号管理', icon: '👥' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* 侧边栏 */}
      <div style={{
        width: collapsed ? 56 : 220,
        background: '#1a1a1a',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        flexShrink: 0,
      }}>
        <div style={{ padding: collapsed ? '16px 8px' : '20px 16px', borderBottom: '1px solid #333' }}>
          {!collapsed && <div style={{ fontWeight: 700, fontSize: 15 }}>审片系统</div>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none', border: 'none', color: '#888', cursor: 'pointer',
              marginTop: 8, padding: 0, fontSize: 12,
            }}
          >
            {collapsed ? '→' : '← 收起'}
          </button>
        </div>

        <nav style={{ flex: 1, padding: '8px 0' }}>
          {menu.map((m) => {
            const active = location.pathname === m.path ||
              (m.path === '/' && location.pathname === '/');
            return (
              <Link
                key={m.path}
                to={m.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: collapsed ? '10px 0' : '10px 16px',
                  color: active ? '#fff' : '#aaa',
                  background: active ? '#333' : 'transparent',
                  textDecoration: 'none', fontSize: 13,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
                title={m.label}
              >
                <span style={{ fontSize: 16 }}>{m.icon}</span>
                {!collapsed && m.label}
              </Link>
            );
          })}
        </nav>

        {isAdmin && (
          <div style={{ borderTop: '1px solid #333', padding: '8px 0' }}>
            {adminMenu.map((m) => {
              const active = location.pathname === m.path;
              return (
                <Link
                  key={m.path}
                  to={m.path}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: collapsed ? '10px 0' : '10px 16px',
                    color: active ? '#fff' : '#aaa',
                    background: active ? '#333' : 'transparent',
                    textDecoration: 'none', fontSize: 13,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                  }}
                  title={m.label}
                >
                  <span style={{ fontSize: 16 }}>{m.icon}</span>
                  {!collapsed && m.label}
                </Link>
              );
            })}
          </div>
        )}

        {/* 用户信息 */}
        <div style={{ borderTop: '1px solid #333', padding: '12px 16px' }}>
          {!collapsed && (
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
              {username || profile?.email || '用户'}
            </div>
          )}
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: '#888',
              cursor: 'pointer', padding: 0, fontSize: 12,
            }}
          >
            {collapsed ? '⎋' : '退出登录'}
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, background: '#f5f5f5', minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  );
}
