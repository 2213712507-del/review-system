import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [projectRoles, setProjectRoles] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setProjectRoles({});
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        setProfile(data);
        await fetchProjectRoles(userId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setLoading(false);
    }
  }

  async function fetchProjectRoles(userId) {
    try {
      const { data } = await supabase
        .from('project_members')
        .select('project_id, role')
        .eq('user_id', userId);
      const map = {};
      (data || []).forEach((m) => {
        map[m.project_id] = m.role || 'member';
      });
      setProjectRoles(map);
    } catch (err) {
      console.error('Failed to fetch project roles:', err);
    } finally {
      setLoading(false);
    }
  }

  const isAdmin = profile?.role === 'admin';
  const isUploader = profile?.role === 'uploader';
  const isApproved = profile?.status === 'approved';
  const username = profile?.username || '';

  // 是否能看某个项目的全部内容
  function canSeeAllInProject(projectId) {
    if (isAdmin) return true;
    if (projectRoles[projectId] === 'admin') return true;
    return false;
  }

  // 获取用户在指定项目的角色
  function getProjectRole(projectId) {
    return projectRoles[projectId] || null;
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      isAdmin, isUploader, isApproved, username,
      projectRoles, canSeeAllInProject, getProjectRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
