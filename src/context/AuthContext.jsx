import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const Ctx = createContext(null)

// Session and the signed-in person's Avilo profile (role, station scope, supplier).
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [recovery, setRecovery] = useState(false)

  const loadProfile = useCallback(async (s) => {
    if (!s) { setProfile(null); return }
    const { data, error: e } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    if (e) setError(e.message)
    setProfile(data || null)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
      loadProfile(s)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const signIn = async (email, password) => {
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (e) throw new Error(e.message === 'Invalid login credentials' ? 'That e-mail and password do not match an Avilo account.' : e.message)
  }
  const signOut = async () => { await supabase.auth.signOut(); setProfile(null) }

  return (
    <Ctx.Provider value={{ session, profile, role: profile?.role, loading, error, recovery, endRecovery: () => setRecovery(false), signIn, signOut }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
