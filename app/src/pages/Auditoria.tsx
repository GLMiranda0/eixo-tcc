import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { formatarCnpj } from '../lib/cnpj'
import { PAPEL_LABEL, type Auditoria as Registro, type Papel } from '../lib/types'

const POR_PAGINA = 50

/* ------------------------------------------------------------------ *
 * Categorias de evento (coluna auditoria.evento, migração 004).
 * Master, admin e comum só recebem do banco as linhas com evento preenchido:
 * cadastro/edição de motor e coletor, convites e níveis de usuário, tratativa de alertas.
 * O dev recebe tudo, inclusive os eventos automáticos (ingestão, criação de usuário, alertas do sistema).
 * ------------------------------------------------------------------ */
const CATEGORIAS: Record<string, { rotulo: string; tabelas: string[] }> = {
  motores: { rotulo: 'Motores e coletores', tabelas: ['motores', 'coletores', 'regras_diagnostico'] },
  usuarios: { rotulo: 'Usuários e convites', tabelas: ['convites', 'perfis', 'contas'] },
  alertas: { rotulo: 'Tratativa de alertas', tabelas: ['alertas'] },
}

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

/* ---------------- ícones (traço, 24×24) ---------------- */
const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)
const ICONES = {
  motor: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h3l2-4 3 8 2-5 1 1h5" />
    </>,
  ),
  coletor: svg(
    <>
      <rect x="6" y="9" width="12" height="11" rx="2" />
      <path d="M9 9V5M15 9V5M9.5 14.5h5" />
    </>,
  ),
  editar: svg(
    <>
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </>,
  ),
  excluir: svg(
    <>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </>,
  ),
  convite: svg(
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6" />
    </>,
  ),
  cancelar: svg(
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 9l4 4M21 9l-4 4" />
    </>,
  ),
  nivel: svg(
    <>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </>,
  ),
  usuario: svg(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
    </>,
  ),
  alerta: svg(
    <>
      <path d="M6 16V11a6 6 0 1112 0v5l2 2H4l2-2z" />
      <path d="M10 21h4" />
    </>,
  ),
  ok: svg(<path d="M5 12l5 5 9-10" />),
  silenciar: svg(
    <>
      <path d="M6 16V11a6 6 0 019-5.2M18 11v5l2 2H8" />
      <path d="M3 3l18 18" />
    </>,
  ),
  empresa: svg(
    <>
      <path d="M4 21V5l8-2v18M12 9l8 2v10M8 9h0M8 13h0M8 17h0M16 15h0M16 18h0" />
    </>,
  ),
  sistema: svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>,
  ),
}
type Icone = keyof typeof ICONES

/* ---------------- rótulos dos campos para o texto das alterações ---------------- */
const CAMPOS: Record<string, string> = {
  tag: 'TAG',
  nome: 'Nome',
  fabricante: 'Fabricante',
  modelo: 'Modelo',
  potencia_cv: 'Potência (cv)',
  tensao_nominal_v: 'Tensão nominal (V)',
  corrente_nominal_a: 'Corrente nominal (A)',
  rpm_nominal: 'Rotação nominal (rpm)',
  aplicacao: 'Aplicação',
  simulado: 'Simulado',
  tipo: 'Tipo de coletor',
  protocolo: 'Protocolo',
  mede_temp: 'Mede temperatura',
  mede_corr: 'Mede corrente',
  mede_vib: 'Mede vibração',
  mede_tens: 'Mede tensão',
  mede_rot: 'Mede rotação',
  status: 'Situação',
  acao_registrada: 'Ação registrada',
  papel: 'Nível',
  ativo: 'Situação do usuário',
  limite_atencao: 'Limite de atenção',
  limite_critico: 'Limite crítico',
  persistencia: 'Persistência',
  razao_social: 'Razão social',
  cnpj: 'CNPJ',
}
const IGNORAR = new Set(['id', 'conta_id', 'motor_id', 'criado_em', 'criado_por', 'ultimo_contato', 'reconhecido_por', 'reconhecido_em', 'token_hash', 'anomalia_id'])

const VALORES: Record<string, Record<string, string>> = {
  aplicacao: { fixa: 'Velocidade fixa', multispeed: 'Multivelocidade' },
  tipo: { eixo: 'Coletor Eixo (ESP32)', terceiro: 'Coletor de terceiro' },
  protocolo: { post: 'POST HTTPS', mqtt: 'MQTT' },
  status: { ativo: 'Ativo', reconhecido: 'Reconhecido', resolvido: 'Resolvido', silenciado: 'Silenciado' },
  papel: PAPEL_LABEL,
  severidade: { atencao: 'Atenção', critico: 'Crítico' },
}

function legivel(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return campo === 'ativo' ? (v ? 'Ativo' : 'Desativado') : v ? 'Sim' : 'Não'
  if (campo === 'cnpj') return formatarCnpj(String(v))
  const mapa = VALORES[campo]
  if (mapa && typeof v === 'string' && mapa[v]) return mapa[v]
  if (typeof v === 'number') return v.toLocaleString('pt-BR')
  return String(v)
}

interface Mudanca {
  campo: string
  de: string
  para: string
}

function mudancas(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null): Mudanca[] {
  const a = antes ?? {}
  const d = depois ?? {}
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter((k) => !IGNORAR.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]))
    .map((k) => ({ campo: CAMPOS[k] ?? k, de: legivel(k, a[k]), para: legivel(k, d[k]) }))
}

function ficha(obj: Record<string, unknown> | null, campos: string[]): Mudanca[] {
  if (!obj) return []
  return campos.filter((k) => obj[k] !== null && obj[k] !== undefined && obj[k] !== '').map((k) => ({ campo: CAMPOS[k] ?? k, de: '', para: legivel(k, obj[k]) }))
}

const medidas = (c: Record<string, unknown> | null) =>
  c
    ? (
        [
          ['mede_temp', 'temperatura'],
          ['mede_corr', 'corrente'],
          ['mede_vib', 'vibração'],
          ['mede_tens', 'tensão'],
          ['mede_rot', 'rotação'],
        ] as const
      )
        .filter(([k]) => c[k])
        .map(([, n]) => n)
        .join(', ')
    : ''

/* ---------------- descrição de um evento ---------------- */
interface Contexto {
  motores: Record<string, { tag: string; nome: string }>
  pessoas: Record<string, string>
}

interface Evento {
  r: Registro
  icone: Icone
  tom: 'ok' | 'warn' | 'crit' | 'acc' | 'sys' | ''
  titulo: string
  desc: ReactNode
  itens: Mudanca[]
  /** true: só a ficha (valores); false: de → para */
  soValores?: boolean
  automatico: boolean
  /** coletor cadastrado/removido junto com o motor */
  anexo?: Registro
}

const str = (o: Record<string, unknown> | null, k: string) => (o && o[k] != null ? String(o[k]) : '')

function nomeMotor(ctx: Contexto, id: string, fallback?: Record<string, unknown> | null) {
  const m = ctx.motores[id]
  const tag = m?.tag || str(fallback ?? null, 'tag')
  const nome = m?.nome || str(fallback ?? null, 'nome')
  return tag ? (nome ? `${tag} · ${nome}` : tag) : 'motor removido'
}

function descrever(r: Registro, ctx: Contexto, anexo?: Registro): Evento {
  const a = r.antes
  const d = r.depois
  const obj = d ?? a
  const automatico = !r.evento
  const base = { r, automatico, itens: [] as Mudanca[], anexo }
  const papel = (v: string) => PAPEL_LABEL[v as Papel] ?? v

  switch (r.evento) {
    case 'motor_cadastro': {
      const col = anexo?.depois ?? null
      return {
        ...base,
        icone: 'motor',
        tom: 'ok',
        titulo: col ? 'Cadastro de motor + coletor' : 'Cadastro de motor',
        desc: (
          <>
            <b>{nomeMotor(ctx, r.registro_id ?? '', d)}</b>
            {col && (
              <>
                {' '}
                com {legivel('tipo', col.tipo).toLowerCase()} via {legivel('protocolo', col.protocolo)}
                {medidas(col) && `, medindo ${medidas(col)}`}
              </>
            )}
          </>
        ),
        itens: ficha(d, ['fabricante', 'modelo', 'potencia_cv', 'tensao_nominal_v', 'corrente_nominal_a', 'rpm_nominal', 'aplicacao']),
        soValores: true,
      }
    }
    case 'coletor_cadastro':
      return {
        ...base,
        icone: 'coletor',
        tom: 'ok',
        titulo: 'Cadastro de coletor',
        desc: (
          <>
            {legivel('tipo', d?.tipo)} via {legivel('protocolo', d?.protocolo)} no motor <b>{nomeMotor(ctx, str(d, 'motor_id'))}</b>
          </>
        ),
        itens: medidas(d) ? [{ campo: 'Mede', de: '', para: medidas(d) }] : [],
        soValores: true,
      }
    case 'motor_edicao':
      return { ...base, icone: 'editar', tom: 'acc', titulo: 'Edição de motor', desc: <b>{nomeMotor(ctx, r.registro_id ?? '', d)}</b>, itens: mudancas(a, d) }
    case 'coletor_edicao':
      return {
        ...base,
        icone: 'coletor',
        tom: 'acc',
        titulo: 'Edição de coletor',
        desc: (
          <>
            Coletor do motor <b>{nomeMotor(ctx, str(d, 'motor_id'))}</b>
          </>
        ),
        itens: mudancas(a, d),
      }
    case 'motor_exclusao':
      return {
        ...base,
        icone: 'excluir',
        tom: 'crit',
        titulo: anexo ? 'Exclusão de motor + coletor' : 'Exclusão de motor',
        desc: <b>{nomeMotor(ctx, r.registro_id ?? '', a)}</b>,
      }
    case 'coletor_exclusao':
      return {
        ...base,
        icone: 'excluir',
        tom: 'crit',
        titulo: 'Remoção de coletor',
        desc: (
          <>
            Coletor do motor <b>{nomeMotor(ctx, str(a, 'motor_id'))}</b>
          </>
        ),
      }
    case 'convite':
      return {
        ...base,
        icone: 'convite',
        tom: 'ok',
        titulo: `Convite de usuário ${papel(str(d, 'papel'))}`,
        desc: (
          <>
            <b className="mono">{str(d, 'email')}</b> foi convidado como {papel(str(d, 'papel'))}
          </>
        ),
      }
    case 'convite_cancelado':
      return {
        ...base,
        icone: 'cancelar',
        tom: 'warn',
        titulo: 'Convite cancelado',
        desc: (
          <>
            Convite de <b className="mono">{str(a, 'email')}</b> ({papel(str(a, 'papel'))}) foi cancelado
          </>
        ),
      }
    case 'usuario_papel':
      return {
        ...base,
        icone: 'nivel',
        tom: 'acc',
        titulo: 'Mudança de nível de usuário',
        desc: (
          <>
            <b>{str(d, 'nome') || str(d, 'email')}</b> passou de {papel(str(a, 'papel'))} para <b>{papel(str(d, 'papel'))}</b>
          </>
        ),
      }
    case 'usuario_ativo': {
      const ativo = d?.ativo === true
      return {
        ...base,
        icone: ativo ? 'usuario' : 'cancelar',
        tom: ativo ? 'ok' : 'crit',
        titulo: ativo ? 'Usuário reativado' : 'Usuário desativado',
        desc: <b>{str(d, 'nome') || str(d, 'email')}</b>,
      }
    }
    case 'alerta_tratativa': {
      const st = str(d, 'status')
      const t = {
        reconhecido: { titulo: 'Alerta reconhecido', icone: 'ok' as Icone, tom: 'ok' as const },
        silenciado: { titulo: 'Alerta silenciado', icone: 'silenciar' as Icone, tom: 'warn' as const },
        resolvido: { titulo: 'Alerta resolvido', icone: 'ok' as Icone, tom: 'ok' as const },
        ativo: { titulo: 'Alerta reaberto', icone: 'alerta' as Icone, tom: 'crit' as const },
      }[st] ?? { titulo: 'Tratativa de alerta', icone: 'alerta' as Icone, tom: 'acc' as const }
      const acao = str(d, 'acao_registrada')
      return {
        ...base,
        ...t,
        desc: (
          <>
            <span className={'pill ' + (str(d, 'severidade') === 'critico' ? 'crit' : 'warn')} style={{ padding: '1px 8px', fontSize: 11 }}>
              {legivel('severidade', d?.severidade)}
            </span>{' '}
            <b>{str(d, 'titulo')}</b> · motor {nomeMotor(ctx, str(d, 'motor_id'))}
          </>
        ),
        itens: acao ? [{ campo: 'Ação registrada', de: '', para: `“${acao}”` }] : [],
        soValores: true,
      }
    }
  }

  // ---------- eventos automáticos e demais operações (só o dev vê) ----------
  const sys = { ...base, tom: 'sys' as const, icone: 'sistema' as Icone }
  if (r.tabela === 'alertas' && r.operacao === 'INSERT')
    return {
      ...sys,
      icone: 'alerta',
      tom: 'crit',
      titulo: 'Alerta aberto pelo sistema',
      desc: (
        <>
          <b>{str(d, 'titulo')}</b> · motor {nomeMotor(ctx, str(d, 'motor_id'))}
        </>
      ),
    }
  if (r.tabela === 'perfis' && r.operacao === 'INSERT')
    return { ...sys, icone: 'usuario', titulo: 'Nova conta de usuário', desc: <b className="mono">{str(d, 'email')}</b> }
  if (r.tabela === 'perfis' && r.operacao === 'UPDATE' && !a?.conta_id && d?.conta_id)
    return {
      ...sys,
      icone: 'usuario',
      titulo: 'Usuário entrou na empresa',
      desc: (
        <>
          <b className="mono">{str(d, 'email')}</b> como {papel(str(d, 'papel'))}
        </>
      ),
    }
  if (r.tabela === 'convites' && r.operacao === 'UPDATE' && d?.aceito_em)
    return { ...sys, icone: 'convite', titulo: 'Convite aceito', desc: <b className="mono">{str(d, 'email')}</b> }
  if (r.tabela === 'contas' && r.operacao === 'INSERT')
    return {
      ...sys,
      icone: 'empresa',
      titulo: 'Empresa cadastrada',
      desc: (
        <>
          <b>{str(d, 'nome')}</b>
          {d?.cnpj ? ` · CNPJ ${formatarCnpj(str(d, 'cnpj'))}` : ''}
        </>
      ),
      itens: ficha(d, ['razao_social', 'cnpj']),
      soValores: true,
    }
  if (r.tabela === 'coletores' && r.operacao === 'UPDATE')
    return { ...sys, icone: 'coletor', titulo: 'Coletor comunicou', desc: <>Motor {nomeMotor(ctx, str(d, 'motor_id'))}</>, itens: mudancas(a, d) }
  if (r.tabela === 'regras_diagnostico' && r.operacao === 'INSERT')
    return { ...sys, titulo: 'Limites padrão criados', desc: <>Motor {nomeMotor(ctx, str(d, 'motor_id'))}</> }
  return {
    ...sys,
    titulo: `${OP[r.operacao].txt} em ${TABELAS[r.tabela] ?? r.tabela}`,
    desc: <span className="mono">{str(obj, 'email') || str(obj, 'titulo') || str(obj, 'nome') || (r.registro_id ?? '').slice(0, 8)}</span>,
    itens: r.operacao === 'UPDATE' ? mudancas(a, d) : [],
  }
}

/** Junta o coletor cadastrado (ou removido) no mesmo instante que o motor num único evento. */
function agrupar(linhas: Registro[], ctx: Contexto): Evento[] {
  const usados = new Set<number>()
  const parDe = (evMotor: string, evColetor: string, campo: 'depois' | 'antes') => {
    const m = new Map<string, Registro>()
    linhas.forEach((l) => {
      if (l.evento === evColetor) {
        const mid = String(l[campo]?.motor_id ?? '')
        if (mid && !m.has(mid)) m.set(mid, l)
      }
    })
    return (r: Registro) => (r.evento === evMotor ? m.get(r.registro_id ?? '') : undefined)
  }
  const cadastro = parDe('motor_cadastro', 'coletor_cadastro', 'depois')
  const exclusao = parDe('motor_exclusao', 'coletor_exclusao', 'antes')
  linhas.forEach((r) => {
    const anexo = cadastro(r) ?? exclusao(r)
    if (anexo) usados.add(anexo.id)
  })
  return linhas.filter((r) => !usados.has(r.id)).map((r) => descrever(r, ctx, cadastro(r) ?? exclusao(r)))
}

function rotuloDia(ts: string) {
  const d = new Date(ts)
  const hoje = new Date()
  const ontem = new Date(hoje.getTime() - 86400000)
  const mesmo = (x: Date, y: Date) => x.toDateString() === y.toDateString()
  if (mesmo(d, hoje)) return 'Hoje'
  if (mesmo(d, ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

/* ---------------- visão técnica (dev) ---------------- */
const valor = (v: unknown) => (v === undefined ? '–' : JSON.stringify(v))

function Tecnico({ r }: { r: Registro }) {
  const [json, setJson] = useState(false)
  let corpo: ReactNode
  if (json) {
    corpo = <pre className="code">{JSON.stringify({ antes: r.antes, depois: r.depois }, null, 2)}</pre>
  } else if (r.operacao === 'UPDATE') {
    const antes = r.antes ?? {}
    const depois = r.depois ?? {}
    const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]))
    corpo = !chaves.length ? (
      <p className="muted">Nenhum campo mudou.</p>
    ) : (
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
  } else {
    corpo = <pre className="code">{JSON.stringify(r.operacao === 'INSERT' ? r.depois : r.antes, null, 2)}</pre>
  }
  return (
    <div className="steps" style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span className="muted mono" style={{ fontSize: 12 }}>
          {r.tabela} · {r.operacao} · {r.registro_id ?? '–'} · evento: {r.evento ?? 'automático'}
        </span>
        <div className="seg" role="group" aria-label="Formato">
          <button className={json ? '' : 'on'} onClick={() => setJson(false)}>
            Tabela
          </button>
          <button className={json ? 'on' : ''} onClick={() => setJson(true)}>
            JSON
          </button>
        </div>
      </div>
      {corpo}
    </div>
  )
}

/* ---------------- página ---------------- */
export function Auditoria() {
  const { isDev, contaVisualizada } = useAuth()
  const [linhas, setLinhas] = useState<Registro[]>([])
  const [categoria, setCategoria] = useState('')
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [fim, setFim] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const [empresas, setEmpresas] = useState<Record<string, string>>({})
  const [ctx, setCtx] = useState<Contexto>({ motores: {}, pessoas: {} })
  /** dev: visão de eventos (como o cliente vê) ou técnica (tabela/JSON) */
  const [visao, setVisao] = useState<'eventos' | 'tecnica'>('eventos')
  /** dev: incluir eventos automáticos */
  const [automaticos, setAutomaticos] = useState(true)
  const contaFiltro = isDev ? contaVisualizada?.id ?? null : null

  useEffect(() => {
    const t = setTimeout(() => setBusca(texto.trim()), 350)
    return () => clearTimeout(t)
  }, [texto])

  // nomes de motores e pessoas para o texto dos eventos (RLS limita à empresa)
  useEffect(() => {
    let mq = supabase.from('motores').select('id, tag, nome')
    let pq = supabase.from('perfis').select('id, nome, email')
    if (contaFiltro) {
      mq = mq.eq('conta_id', contaFiltro)
      pq = pq.eq('conta_id', contaFiltro)
    }
    Promise.all([mq, pq]).then(([m, p]) => {
      const motores: Contexto['motores'] = {}
      ;((m.data as { id: string; tag: string; nome: string }[]) ?? []).forEach((x) => (motores[x.id] = { tag: x.tag, nome: x.nome }))
      const pessoas: Contexto['pessoas'] = {}
      ;((p.data as { id: string; nome: string | null; email: string | null }[]) ?? []).forEach((x) => (pessoas[x.id] = x.nome || x.email || ''))
      setCtx({ motores, pessoas })
    })
  }, [contaFiltro])

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
      if (categoria) q = q.in('tabela', CATEGORIAS[categoria].tabelas)
      if (busca) q = q.ilike('usuario_email', `%${busca}%`)
      if (contaFiltro) q = q.eq('conta_id', contaFiltro)
      // master/admin/comum já recebem só os eventos (RLS); o dev escolhe se vê os automáticos
      if (isDev && !automaticos) q = q.not('evento', 'is', null)
      const { data, error } = await q
      setCarregando(false)
      if (error) return setErro(error.message)
      const novos = (data as Registro[]) ?? []
      setLinhas((prev) => (desde === 0 ? novos : [...prev, ...novos]))
      setFim(novos.length < POR_PAGINA)
    },
    [categoria, busca, contaFiltro, isDev, automaticos],
  )

  useEffect(() => {
    setAberto(null)
    buscar(0)
  }, [buscar])

  const eventos = useMemo(() => agrupar(linhas, ctx), [linhas, ctx])
  const quem = (r: Registro) => (r.usuario_id ? ctx.pessoas[r.usuario_id] || r.usuario_email || 'usuário' : 'Sistema')
  const tecnica = isDev && visao === 'tecnica'

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Auditoria</p>
          <h1>Histórico de atividades</h1>
          <p className="muted">
            {isDev
              ? 'Todas as operações, inclusive as automáticas (ingestão, novas contas, alertas abertos pelo sistema).'
              : 'Cadastros e edições de motores e coletores, convites e níveis de usuário e tratativas de alertas, com quem fez e quando.'}
            {isDev && (contaVisualizada ? ` Filtrando pela empresa ${contaVisualizada.nome}.` : ' Mostrando todas as empresas.')}
          </p>
        </div>
        {isDev && (
          <div className="seg" role="group" aria-label="Visão">
            <button className={visao === 'eventos' ? 'on' : ''} onClick={() => setVisao('eventos')}>
              Eventos
            </button>
            <button className={visao === 'tecnica' ? 'on' : ''} onClick={() => setVisao('tecnica')}>
              Técnica
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="grid g3" style={{ alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="au-cat">Tipo de atividade</label>
            <select id="au-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(CATEGORIAS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="au-email">Quem fez</label>
            <input id="au-email" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por e-mail" />
          </div>
          {isDev && (
            <label className="row" style={{ gap: 8, fontSize: 13, paddingBottom: 10 }}>
              <input type="checkbox" checked={automaticos} onChange={(e) => setAutomaticos(e.target.checked)} style={{ width: 'auto' }} />
              Incluir eventos automáticos
            </label>
          )}
        </div>
      </div>

      {erro && (
        <p className="err" style={{ marginBottom: 10 }}>
          {erro}
        </p>
      )}

      {!carregando && linhas.length === 0 ? (
        <div className="empty">Nenhuma atividade registrada com esses filtros.</div>
      ) : (
        <div className="card pad0">
          {tecnica ? (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data e hora</th>
                    <th>Usuário</th>
                    <th>Operação</th>
                    <th>Tabela</th>
                    <th>Registro</th>
                    <th>Empresa</th>
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
                        <td className="muted" title={r.conta_id ?? ''}>
                          {r.conta_id ? empresas[r.conta_id] ?? <span className="mono">{r.conta_id.slice(0, 8)}</span> : '–'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setAberto(aberto === r.id ? null : r.id)} aria-expanded={aberto === r.id}>
                            {aberto === r.id ? 'Fechar' : 'Ver'}
                          </button>
                        </td>
                      </tr>
                      {aberto === r.id && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
                            <Tecnico r={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ev-list">
              {eventos.map((ev, i) => {
                const r = ev.r
                const dia = rotuloDia(r.ts)
                const novoDia = i === 0 || rotuloDia(eventos[i - 1].r.ts) !== dia
                const temDetalhe = ev.itens.length > 0 || isDev
                const abertoAqui = aberto === r.id
                return (
                  <Fragment key={r.id}>
                    {novoDia && <div className="ev-day">{dia}</div>}
                    <div className="ev">
                      <div className={'ic ' + ev.tom}>{ICONES[ev.icone]}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="tt">{ev.titulo}</div>
                        <div className="desc">{ev.desc}</div>
                        {ev.itens.length > 0 && !abertoAqui && ev.itens.length <= 2 && !ev.soValores && (
                          <ul className="ev-changes">
                            {ev.itens.map((m) => (
                              <li key={m.campo}>
                                <span className="muted">{m.campo}:</span> <span className="de">{m.de}</span> → <span className="para">{m.para}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="meta">
                          {r.usuario_id ? (
                            <span>
                              por <b style={{ color: 'var(--fg)' }}>{quem(r)}</b>
                            </span>
                          ) : (
                            <span className="pill" style={{ padding: '1px 8px', fontSize: 11 }}>
                              Automático
                            </span>
                          )}
                          {isDev && r.conta_id && <span>· {empresas[r.conta_id] ?? r.conta_id.slice(0, 8)}</span>}
                          {temDetalhe && (
                            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => setAberto(abertoAqui ? null : r.id)} aria-expanded={abertoAqui}>
                              {abertoAqui ? 'Ocultar detalhes' : 'Ver detalhes'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="when num">{new Date(r.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                      {abertoAqui && (
                        <div className="det">
                          {ev.itens.length > 0 && (
                            <ul className="ev-changes" style={{ marginBottom: isDev ? 12 : 0 }}>
                              {ev.itens.map((m) => (
                                <li key={m.campo}>
                                  <span className="muted">{m.campo}:</span>
                                  {ev.soValores ? (
                                    <span>{m.para}</span>
                                  ) : (
                                    <>
                                      <span className="de">{m.de}</span> → <span className="para">{m.para}</span>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {isDev && (
                            <>
                              <Tecnico r={r} />
                              {ev.anexo && (
                                <div style={{ marginTop: 10 }}>
                                  <Tecnico r={ev.anexo} />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </Fragment>
                )
              })}
            </div>
          )}
          <div className="row" style={{ padding: 12, justifyContent: 'center', borderTop: '1px solid var(--border)' }}>
            {carregando ? (
              <span className="muted">Carregando…</span>
            ) : fim ? (
              <span className="muted">
                {tecnica ? linhas.length : eventos.length} atividade(s) · fim da lista
              </span>
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
