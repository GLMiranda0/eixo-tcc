import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { ThemeToggle } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export function Shell() {
  const { session, perfil, sair } = useAuth()
  const [ativos, setAtivos] = useState(0)

  useEffect(() => {
    const carregar = () =>
      supabase
        .from('alertas')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ativo')
        .then(({ count }) => setAtivos(count ?? 0))
    carregar()
    const ch = supabase
      .channel('alertas-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, carregar)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  const item = (to: string, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'on' : '')}>
      {label}
      {badge ? <span className="badge">{badge}</span> : null}
    </NavLink>
  )

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Logo />
          <span className="word">eixo</span>
        </div>
        <nav className="nav" aria-label="Principal">
          {item('/painel', 'Visão geral')}
          {item('/motores', 'Motores')}
          {item('/alertas', 'Alertas', ativos)}
          {item('/tutorial', 'Caminho de Tutorial')}
        </nav>
        <div className="foot">
          <span>
            {perfil?.nome || session?.user.email}
            <br />
            <span className="mono">{perfil?.papel ?? 'operador'}</span>
          </span>
          <ThemeToggle />
          <button className="btn btn-ghost btn-sm" onClick={sair}>
            Sair
          </button>
        </div>
      </aside>
      <div className="main">
        <Outlet />
      </div>
    </div>
  )
}
