import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAlertas, useMotores, useUltimasLeituras } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import { SEV_LABEL, fmt, pior, type Regra, type StatusAprendizado } from '../lib/types'

export function Painel() {
  const nav = useNavigate()
  const { perfil, session } = useAuth()
  const { motores, carregando } = useMotores()
  const ids = useMemo(() => motores.map((m) => m.id), [motores])
  const ultimas = useUltimasLeituras(ids)
  const { alertas } = useAlertas(true)
  const [regras, setRegras] = useState<Regra[]>([])
  const [status, setStatus] = useState<Record<string, StatusAprendizado>>({})
  const [leiturasHoje, setLeiturasHoje] = useState<number | null>(null)

  useEffect(() => {
    if (!ids.length) return
    supabase.from('regras_diagnostico').select('*').in('motor_id', ids).then(({ data }) => setRegras((data as Regra[]) ?? []))
    supabase
      .from('status_aprendizado')
      .select('*')
      .in('motor_id', ids)
      .then(({ data }) => {
        const m: Record<string, StatusAprendizado> = {}
        ;((data as StatusAprendizado[]) ?? []).forEach((s) => (m[s.motor_id] = s))
        setStatus(m)
      })
    const inicio = new Date()
    inicio.setHours(0, 0, 0, 0)
    supabase
      .from('leituras')
      .select('id', { count: 'exact', head: true })
      .gte('ts', inicio.toISOString())
      .then(({ count }) => setLeiturasHoje(count ?? 0))
  }, [ids])

  const hora = new Date().getHours()
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const nome = perfil?.nome || session?.user.email?.split('@')[0] || ''
  const criticos = alertas.filter((a) => a.severidade === 'critico').length

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Visão geral</p>
          <h1>
            {saud}, {nome}
          </h1>
        </div>
        <Link to="/tutorial" className="btn btn-secondary btn-sm">
          Modo simulação
        </Link>
        <Link to="/motores" className="btn btn-primary">
          + Novo motor
        </Link>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="card stripe ok">
          <div className="stat">
            <span className="eyebrow">Motores monitorados</span>
            <span className="v num">{motores.length}</span>
            <span className="muted">{motores.filter((m) => m.simulado).length} em simulação</span>
          </div>
        </div>
        <div className={'card stripe ' + (criticos ? 'crit' : alertas.length ? 'warn' : '')}>
          <div className="stat">
            <span className="eyebrow">Alertas ativos</span>
            <span className="v num">{alertas.length}</span>
            <span className="muted">
              {criticos} crítico · {alertas.length - criticos} atenção
            </span>
          </div>
        </div>
        <div className="card stripe">
          <div className="stat">
            <span className="eyebrow">Leituras hoje</span>
            <span className="v num">{leiturasHoje == null ? '–' : leiturasHoje.toLocaleString('pt-BR')}</span>
            <span className="muted">todas as contas desta organização</span>
          </div>
        </div>
        <div className="card stripe">
          <div className="stat">
            <span className="eyebrow">Modelo</span>
            <span className="v num">{Object.values(status).filter((s) => s.fase >= 2).length}</span>
            <span className="muted">motores com linha de base aprendida</span>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <div className="card pad0">
          {carregando ? (
            <p className="muted" style={{ padding: 20 }}>
              Carregando…
            </p>
          ) : motores.length === 0 ? (
            <div className="empty" style={{ margin: 16 }}>
              Nenhum motor cadastrado ainda. <Link to="/tutorial">Comece pelo Caminho de Tutorial</Link> ou <Link to="/motores">cadastre um motor real</Link>.
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Motor</th>
                    <th>Status</th>
                    <th>Corrente</th>
                    <th>Temp.</th>
                    <th>Vibração</th>
                    <th>Rotação</th>
                    <th>Modelo</th>
                  </tr>
                </thead>
                <tbody>
                  {motores.map((m) => {
                    const l = ultimas[m.id] ?? null
                    const rs = regras.filter((r) => r.motor_id === m.id)
                    const sev = pior(rs, l, ['temp', 'corr', 'vib'])
                    const st = status[m.id]
                    return (
                      <tr key={m.id} className="row-link" onClick={() => nav('/motores/' + m.id)}>
                        <td>
                          <b>{m.tag}</b>
                          <br />
                          <span className="muted">
                            {m.nome}
                            {m.simulado ? ' · simulado' : ''}
                          </span>
                        </td>
                        <td>
                          <span className={'pill ' + sev}>{l ? SEV_LABEL[sev] : 'Sem dados'}</span>
                        </td>
                        <td className="num">{fmt('corr', l?.corr)} A</td>
                        <td className="num">{fmt('temp', l?.temp)} °C</td>
                        <td className="num">{fmt('vib', l?.vib)} mm/s</td>
                        <td className={l?.rot != null ? 'num' : 'muted'}>{l?.rot != null ? fmt('rot', l.rot) + ' rpm' : 'não medida'}</td>
                        <td>
                          {st?.aviso_multispeed ? (
                            <span className="pill warn" title="Aplicação multispeed sem leitura de rotação">
                              ⚠ Multispeed s/ rpm
                            </span>
                          ) : st?.fase && st.fase >= 2 ? (
                            <span className="pill ok">Base aprendida</span>
                          ) : (
                            <span className="muted">Aprendendo · {st?.dias ?? 0}/14 d</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-h">
            <h3>Alertas ativos</h3>
            <Link to="/alertas" className="btn btn-ghost btn-sm">
              Ver todos
            </Link>
          </div>
          {alertas.length === 0 ? (
            <p className="muted">Nenhum alerta ativo.</p>
          ) : (
            <div className="steps">
              {alertas.slice(0, 5).map((a) => {
                const m = motores.find((x) => x.id === a.motor_id)
                return (
                  <div key={a.id} className="alert-item" onClick={() => nav('/alertas?sel=' + a.id)}>
                    <div className={'sev ' + (a.severidade === 'critico' ? 'crit' : 'warn')}>!</div>
                    <div>
                      <b>
                        {m?.tag ?? '?'} · {a.titulo}
                      </b>
                      <br />
                      <span className="muted">
                        {a.mensagem} · {new Date(a.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
