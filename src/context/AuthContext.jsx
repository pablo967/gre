import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando
  const [profile, setProfile] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  // Evita que onAuthStateChange interfiera durante el registro
  const skipAuthChange = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfileLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (skipAuthChange.current) return;
      setSession(session);
      if (session) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setOrganization(null);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    setProfileLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*, organizations(*)')
      .eq('id', userId)
      .single();

    if (data) {
      setProfile(data);
      setOrganization(data.organizations);
    } else {
      setProfile(null);
      setOrganization(null);
    }
    setProfileLoading(false);
  };

  const refreshProfile = async () => {
    const { data: { session: current } } = await supabase.auth.getSession();
    if (current) {
      setSession(current);
      await loadProfile(current.user.id);
    }
  };

  const signOut = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      organization,
      profileLoading,
      skipAuthChange,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
