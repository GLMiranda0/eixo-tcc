import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { PAPEL_LABEL, type Perfil, type VisaoDev } from '../lib/types'

const n = (v: unknown) => Number(v ?? 0)

function contato(ts: string | null) {
  if (!ts) return <span className="muted">nunca</span>
  const seg = (Date.now() - new Date(ts).getTime()) / 1000
  const txt = new Date(ts).toLocaleString('pt-BR')
  return <span className={seg < 60 ? 'pill ok' : 'muted'}>{seg < 60 ? 'agora' : txt}</span>
}

export function Dev() {
  const nav = useNavigate()
  const { contaVisualizada, setContaVisualizada } = useAuth()
  const [empresas, setEmpresas] = useState<VisaoDev[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<VisaoDev | null>(null)
  const [usuarios, setUsuarios] = useState<Perfil[]>([])

  useEffect(() => {
    supabase
      .from('visao_dev')
      .select('*')
      .order('nome')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        setEmpresas((data as VisaoDev[]) ?? [])
        setCarregando(false)
      })
  }, [])

  // pré-seleciona (uma vez) a empresa que já está em visualização
  const preSel = useRef(false)
  useEffect(() => {
    if (preSel.current || !contaVisualizada || !empresas.length) return
    preSel.current = true
    setSel(empresas.find((e) => e.conta_id === contaVisualizada.id) ?? null)
  }, [empresas, contaVisualizada])

  useEffect(() => {
    if (!sel) return setUsuarios([])
    supabase
      .from('perfis')
      .select('*')
      .eq('conta_id', sel.conta_id)
      .order('criado_em')
      .then(({ data }) => setUsuarios((data as Perfil[]) ?? []))
  }, [sel])

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? empresas.filter((e) => e.nome.toLowerCase().includes(t) || (e.cnpj ?? '').includes(t)) : empresas
  }, [empresas, busca])

  const tot = useMemo(
    () => ({
      usuarios: empresas.reduce((s, e) => s + n(e.usuarios), 0),
      motores: empresas.reduce((s, e) => s + n(e.motores), 0),
      coletores: empresas.reduce((s, e) => s + n(e.coletores), 0),
      alertas: empresas.reduce((s, e) => s + n(e.alertas_ativos), 0),
    }),
    [empresas],
  )

  function abrir(e: VisaoDev) {
    setContaVisualizada({ id: e.conta_id, nome: e.nome })
    nav('/painel')
  }

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Dev · suporte</p>
          <h1>Empresas na plataforma</h1>
          <p className="muted">Visão global para suporte. Você enxerga os dados de todas as empresas, mas não edita nada nelas.</p>
        </div>
      </div>

      <div className="grid g5" style={{ marginBottom: 14 }}>
        {[
          ['Empresas', empresas.length, `${empresas.filter((e) => e.ativa).length} ativas`, ''],
          ['Usuários', tot.usuarios, 'ativos, somando todas', ''],
          ['Motores', tot.motores, 'cadastrados', 'ok'],
          ['Coletores', tot.coletores, 'configurados', ''],
          ['Alertas ativos', tot.alertas, 'somando todas', tot.alertas ? 'crit' : 'ok'],
        ].map(([t, v, d, c]) => (
          <div key={t as string} className={'card stripe ' + c}>
            <div className="stat">
              <span className="eyebrow">{t}</span>
              <span className="v num">{carregando ? '–' : (v as number).toLocaleString('pt-BR')}</span>
              <span className="muted">{d}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card pad0" style={{ marginBottom: 14 }}>
        <div className="card-h" style={{ padding: '14px 14px 0' }}>
          <h3>Empresas</h3>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou CNPJ" aria-label="Buscar empresa" style={{ maxWidth: 280 }} />
        </div>
        {erro && (
          <p className="err" style={{ padding: '0 14px' }}>
            {erro}
          </p>
        )}
        {carregando ? (
          <p className="muted" style={{ padding: 20 }}>
            Carregando…
          </p>
        ) : filtradas.length === 0 ? (
          <div className="empty" style={{ margin: 16 }}>
            {empresas.length ? 'Nenhuma empresa encontrada com essa busca.' : 'Nenhuma empresa cadastrada ainda.'}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Usuários</th>
                  <th>Motores</th>
                  <th>Coletores</th>
                  <th>Alertas</th>
                  <th>Último contato</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => (
                  <tr key={e.conta_id} className="row-link" onClick={() => setSel(e)} style={sel?.conta_id === e.conta_id ? { background: 'var(--accent-soft)' } : undefined}>
                    <td>
                      <b>{e.nome}</b>
                      <br />
                      <span className="muted mono" style={{ fontSize: 12 }}>
                        {e.cnpj || 'CNPJ não informado'}
                      </span>
                    </td>
                    <td className="num">
                      {n(e.usuarios)}
                      <br />
                      <span className="muted" style={{ fontSize: 12 }}>
                        M {n(e.masters)} · A {n(e.admins)} · C {n(e.comuns)}
                      </span>
                    </td>
                    <td className="num">{n(e.motores)}</td>
                    <td className="num">{n(e.coletores)}</td>
                    <td>{n(e.alertas_ativos) ? <span className="pill crit">{n(e.alertas_ativos)}</span> : <span className="muted">0</span>}</td>
                    <td>{contato(e.ultimo_contato)}</td>
                    <td>
                      <span className={'pill ' + (e.ativa ? 'ok' : 'crit')}>{e.ativa ? 'Ativa' : 'Inativa'}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          abrir(e)
                        }}
                      >
                        Abrir quadro
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sel ? (
        <div className="card pad0">
          <div className="card-h" style={{ padding: '14px 14px 0' }}>
            <h3>Usuários da empresa {sel.nome}</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>
              Fechar
            </button>
          </div>
          {usuarios.length === 0 ? (
            <p className="muted" style={{ padding: 14 }}>
              Nenhum usuário encontrado.
            </p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Situação</th>
                    <th>Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id}>
                      <td>{u.nome || '–'}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {u.email ?? '–'}
                      </td>
                      <td>
                        <span className={'pill ' + (u.papel === 'master' ? 'ok' : '')}>{PAPEL_LABEL[u.papel]}</span>
                      </td>
                      <td>
                        <span className={'pill ' + (u.ativo ? 'ok' : 'crit')}>{u.ativo ? 'Ativo' : 'Desativado'}</span>
                      </td>
                      <td className="num muted">{new Date(u.criado_em).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="muted">Clique em uma empresa para ver os usuários dela.</p>
      )}
    </>
  )
}
