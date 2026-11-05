import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Perfil } from './types'

interface AuthState {
  session: Session | null
  perfil: Perfil | null
  carregando: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<AuthState>({ session: null, perfil: null, carregando: true, sair: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setPerfil(null)
      return
    }
    supabase
      .from('perfis')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setPerfil(data as Perfil | null))
  }, [session])

  const sair = async () => {
    await supabase.auth.signOut()
  }

  return <Ctx.Provider value={{ session, perfil, carregando, sair }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
