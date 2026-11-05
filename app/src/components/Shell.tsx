import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { ThemeToggle } from '../lib/theme'
import { useAuth } from '../lib/auth'
import { useIdsMotoresFiltro } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import { PAPEL_LABEL } from '../lib/types'

export function Shell() {
  const nav = useNavigate()
  const { session, perfil, papel, isDev, isMaster, podeEditar, contaVisualizada, setContaVisualizada, sair } = useAuth()
  const ids = useIdsMotoresFiltro()
  const chaveIds = ids ? ids.join(',') : '*'
  const [ativos, setAtivos] = useState(0)

  useEffect(() => {
    const carregar = () => {
      if (ids && !ids.length) return setAtivos(0)
      let q = supabase.from('alertas').select('id', { count: 'exact', head: true }).eq('status', 'ativo')
      if (ids) q = q.in('motor_id', ids)
      q.then(({ count }) => setAtivos(count ?? 0))
    }
    carregar()
    const ch = supabase
      .channel('alertas-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, carregar)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveIds])

  const item = (to: string, label: string, badge?: number) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'on' : '')}>
      {label}
      {badge ? <span className="badge">{badge}</span> : null}
    </NavLink>
  )

  function sairDaVisualizacao() {
    setContaVisualizada(null)
    nav('/dev')
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Logo />
          <span className="word">eixo</span>
        </div>
        <nav className="nav" aria-label="Principal">
          {isDev && item('/dev', 'Dev')}
          {item('/painel', 'Visão geral')}
          {item('/motores', 'Motores')}
          {item('/alertas', 'Alertas', ativos)}
          {item('/tutorial', 'Caminho de Tutorial')}
          {isMaster && item('/usuarios', 'Usuários')}
          {(podeEditar || isDev) && item('/auditoria', 'Auditoria')}
        </nav>
        <div className="foot">
          <span>
            {perfil?.nome || session?.user.email}
            <br />
            {papel ? (
              <span className={'pill ' + (isDev ? 'sim' : isMaster ? 'ok' : '')} style={{ marginTop: 4, fontSize: 11, padding: '2px 8px' }}>
                {PAPEL_LABEL[papel]}
              </span>
            ) : (
              <span className="mono">{perfil && !perfil.ativo ? 'usuário desativado' : 'sem papel'}</span>
            )}
          </span>
          <ThemeToggle />
          <button className="btn btn-ghost btn-sm" onClick={sair}>
            Sair
          </button>
        </div>
      </aside>
      <div className="main">
        {isDev && contaVisualizada && (
          <div className="banner info">
            <div className="sev ok">◎</div>
            <div>
              <b>Visualizando empresa {contaVisualizada.nome} como suporte.</b> <span className="muted">Somente leitura: o papel Dev não edita dados das empresas.</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={sairDaVisualizacao}>
              Sair da visualização
            </button>
          </div>
        )}
        {perfil && !perfil.ativo && (
          <div className="banner">
            <div className="sev warn">!</div>
            <div>
              <b>Seu usuário foi desativado.</b> <span className="muted">Fale com o master da sua empresa para reativar o acesso.</span>
            </div>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  )
}
