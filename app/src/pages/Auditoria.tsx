import { Fragment, useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { Auditoria as Registro } from '../lib/types'

const POR_PAGINA = 50

const TABELAS: Record<string, string> = {
  motores: 'Motores',
  coletores: 'Coletores',
  regras_diagnostico: 'Regras de diagnóstico',
  alertas: 'Alertas',
  perfis: 'Usuários',
  convites: 'Convites',
  contas: 'Empresa',
}

const OP: Record<Registro['operacao'], { txt: string; cls: string }> = {
  INSERT: { txt: 'Criação', cls: 'ok' },
  UPDATE: { txt: 'Alteração', cls: 'warn' },
  DELETE: { txt: 'Exclusão', cls: 'crit' },
}

const valor = (v: unknown) => (v === undefined ? '–' : JSON.stringify(v))

function Diff({ r }: { r: Registro }) {
  if (r.operacao === 'UPDATE') {
    const antes = r.antes ?? {}
    const depois = r.depois ?? {}
    const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    if (!chaves.length) return <p className="muted">Nenhum campo mudou.</p>
    return (
      <table>
        <thead>
          <tr>
            <th>Campo</th>
            <th>Antes</th>
            <th>Depois</th>
          </tr>
        </thead>
        <tbody>
          {chaves.map((k) => (
            <tr key={k}>
              <td className="mono">{k}</td>
              <td className="mono" style={{ color: 'var(--crit)', wordBreak: 'break-all' }}>
                {valor(antes[k])}
              </td>
              <td className="mono" style={{ color: 'var(--ok)', wordBreak: 'break-all' }}>
                {valor(depois[k])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  const obj = r.operacao === 'INSERT' ? r.depois : r.antes
  return <pre className="code">{JSON.stringify(obj, null, 2)}</pre>
}

export function Auditoria() {
  const { isDev, contaVisualizada } = useAuth()
  const [linhas, setLinhas] = useState<Registro[]>([])
  const [tabela, setTabela] = useState('')
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [fim, setFim] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const [empresas, setEmpresas] = useState<Record<string, string>>({})
  const contaFiltro = isDev ? contaVisualizada?.id ?? null : null

  // debounce da busca por e-mail
  useEffect(() => {
    const t = setTimeout(() => setBusca(texto.trim()), 350)
    return () => clearTimeout(t)
  }, [texto])

  // nomes das empresas para o dev
  useEffect(() => {
    if (!isDev) return
    supabase
      .from('contas')
      .select('id, nome')
      .then(({ data }) => {
        const m: Record<string, string> = {}
        ;((data as { id: string; nome: string }[]) ?? []).forEach((c) => (m[c.id] = c.nome))
        setEmpresas(m)
      })
  }, [isDev])

  const buscar = useCallback(
    async (desde: number) => {
      setCarregando(true)
      setErro(null)
      let q = supabase
        .from('auditoria')
        .select('*')
        .order('ts', { ascending: false })
        .range(desde, desde + POR_PAGINA - 1)
      if (tabela) q = q.eq('tabela', tabela)
      if (busca) q = q.ilike('usuario_email', `%${busca}%`)
      if (contaFiltro) q = q.eq('conta_id', contaFiltro)
      const { data, error } = await q
      setCarregando(false)
      if (error) return setErro(error.message)
      const novos = (data as Registro[]) ?? []
      setLinhas((prev) => (desde === 0 ? novos : [...prev, ...novos]))
      setFim(novos.length < POR_PAGINA)
    },
    [tabela, busca, contaFiltro],
  )

  useEffect(() => {
    setAberto(null)
    buscar(0)
  }, [buscar])

  const colunas = isDev ? 7 : 6

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Auditoria</p>
          <h1>Registro de operações</h1>
          <p className="muted">
            Toda criação, alteração e exclusão em motores, coletores, regras, alertas e usuários fica registrada com quem fez e quando.
            {isDev && (contaVisualizada ? ` Filtrando pela empresa ${contaVisualizada.nome}.` : ' Mostrando todas as empresas.')}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="grid g3">
          <div className="field">
            <label htmlFor="au-tabela">Tabela</label>
            <select id="au-tabela" value={tabela} onChange={(e) => setTabela(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(TABELAS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="au-email">E-mail do usuário</label>
            <input id="au-email" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por e-mail" />
          </div>
        </div>
      </div>

      {erro && <p className="err" style={{ marginBottom: 10 }}>{erro}</p>}

      {!carregando && linhas.length === 0 ? (
        <div className="empty">Nenhuma operação registrada com esses filtros.</div>
      ) : (
        <div className="card pad0">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Usuário</th>
                  <th>Operação</th>
                  <th>Tabela</th>
                  <th>Registro</th>
                  {isDev && <th>Empresa</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => (
                  <Fragment key={r.id}>
                    <tr>
                      <td className="num">{new Date(r.ts).toLocaleString('pt-BR')}</td>
                      <td className={r.usuario_email ? 'mono' : 'muted'} style={{ fontSize: 12 }}>
                        {r.usuario_email || 'sistema'}
                      </td>
                      <td>
                        <span className={'pill ' + OP[r.operacao].cls}>{OP[r.operacao].txt}</span>
                      </td>
                      <td>{TABELAS[r.tabela] ?? r.tabela}</td>
                      <td className="mono muted" title={r.registro_id ?? ''}>
                        {r.registro_id ? r.registro_id.slice(0, 8) : '–'}
                      </td>
                      {isDev && (
                        <td className="muted" title={r.conta_id ?? ''}>
                          {r.conta_id ? empresas[r.conta_id] ?? <span className="mono">{r.conta_id.slice(0, 8)}</span> : '–'}
                        </td>
                      )}
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setAberto(aberto === r.id ? null : r.id)} aria-expanded={aberto === r.id}>
                          {aberto === r.id ? 'Fechar' : 'Ver'}
                        </button>
                      </td>
                    </tr>
                    {aberto === r.id && (
                      <tr>
                        <td colSpan={colunas} style={{ background: 'var(--surface-2)' }}>
                          <Diff r={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ padding: 12, justifyContent: 'center' }}>
            {carregando ? (
              <span className="muted">Carregando…</span>
            ) : fim ? (
              <span className="muted">{linhas.length} registro(s) · fim da lista</span>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => buscar(linhas.length)}>
                Carregar mais
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
