import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) {
          if (loginError.message.includes('Email not confirmed')) {
            setError('邮箱尚未验证，请检查收件箱并点击验证链接');
          } else {
            setError(loginError.message);
          }
        } else {
          navigate('/');
        }
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + '/login',
          },
        });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          if (data.user && data.user.identities?.length === 0) {
            setError('该邮箱已注册，请直接登录');
          } else {
            setMessage('注册成功！请检查邮箱，点击验证链接完成验证。验证后请联系管理员审核账号。');
          }
        }
      }
    } catch (err) {
      setError('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>视频审片系统</h1>
        <p style={styles.subtitle}>
          {mode === 'login' ? '登录账号' : '注册新账号'}
        </p>

        {message && <div style={styles.success}>{message}</div>}
        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱地址"
              style={styles.input}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码（至少6位）"
              style={styles.input}
              minLength={6}
              required
            />
          </div>
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <p style={styles.switch}>
          {mode === 'login' ? '还没有账号？' : '已有账号？'}
          <span
            style={styles.link}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage(''); }}
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </span>
        </p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: '48px 40px',
    width: 400,
    maxWidth: '90vw',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    margin: '0 0 8px 0',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    margin: '0 0 32px 0',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#555',
    fontWeight: 500,
  },
  input: {
    padding: '10px 14px',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  button: {
    marginTop: 8,
    padding: '12px',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  switch: {
    marginTop: 24,
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  link: {
    color: '#1a1a1a',
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 4,
  },
  error: {
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 16,
  },
  success: {
    padding: '10px 14px',
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    color: '#16a34a',
    fontSize: 13,
    marginBottom: 16,
  },
};
