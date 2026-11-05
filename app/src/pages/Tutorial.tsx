import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge, NaoMedido } from '../components/Gauge'
import { useAuth, useContaAtiva } from '../lib/auth'
import { useLeituras, useMotor } from '../lib/hooks'
import { ColetorVirtual } from '../lib/sim'
import { novoToken, sha256Hex, supabase } from '../lib/supabase'
import { SEV_LABEL, pior, severidade, type Motor } from '../lib/types'

const ETAPAS = [
  ['Painel', 'Conheça o painel', 'A Visão geral mostra todos os motores, o status de cada um e os alertas ativos. Tudo que você vê vem do motor virtual.'],
  ['Motor', 'Crie o motor virtual', 'Um motor simulado é cadastrado na sua conta com os dados de placa da bancada do TCC. As regras da fase 1 nascem junto.'],
  ['Coletor', 'Ligue o coletor virtual', 'O coletor virtual envia leituras a cada segundo para o mesmo endpoint que o ESP32 usaria. Corrente, temperatura e vibração; sem rotação, como o coletor Eixo.'],
  ['Tempo real', 'Veja os dados chegando', 'Os medidores ao lado atualizam pelo Realtime do banco, não por polling. Com a carga em 40 % a vibração fica na zona B.'],
  ['Aprendizado', 'Entenda o aprendizado', 'Nos primeiros 14 dias valem os limites fixos. Enquanto isso o modelo registra o normal deste motor. Depois, um desvio do envelope aprendido gera alerta mesmo abaixo do limite fixo.'],
  ['Sobrecarga', 'Simule a sobrecarga', 'Arraste a carga acima de 75 %. Corrente e vibração sobem juntas e a vibração cruza 4,5 mm/s (zona D). O banco gera o alerta crítico. Espere ele aparecer.'],
  ['Ação', 'Reconheça e registre a ação', 'Reduza a carga, veja a vibração voltar à zona B e reconheça o alerta na tela de Alertas, registrando o que foi feito.'],
] as const

export function Tutorial() {
  const { perfil, podeEditar } = useAuth()
  const { contaId, pronto, semEmpresa } = useContaAtiva()
  const [etapa, setEtapa] = useState(0)
  const [feitas, setFeitas] = useState<Set<number>>(new Set())
  const [motorSim, setMotorSim] = useState<Motor | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carga, setCarga] = useState(40)
  const [comRot, setComRot] = useState(false)
  const [tick, setTick] = useState(0)
  const sim = useRef<ColetorVirtual | null>(null)
  const { regras, status, recarregar } = useMotor(motorSim?.id)
  const leituras = useLeituras(motorSim?.id, 60)
  const ultima = leituras[leituras.length - 1] ?? null
  const [alertaAtivo, setAlertaAtivo] = useState(false)

  // motor simulado já existente?
  useEffect(() => {
    if (!pronto) return
    if (semEmpresa) return setMotorSim(null)
    let q = supabase.from('motores').select('*').eq('simulado', true)
    if (contaId) q = q.eq('conta_id', contaId)
    q.order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setMotorSim((data as Motor | null) ?? null))
  }, [contaId, pronto, semEmpresa])

  // alerta ativo do motor simulado
  useEffect(() => {
    if (!motorSim) return
    const check = () =>
      supabase
        .from('alertas')
        .select('id', { count: 'exact', head: true })
        .eq('motor_id', motorSim.id)
        .eq('status', 'ativo')
        .then(({ count }) => {
          const tem = (count ?? 0) > 0
          setAlertaAtivo(tem)
          if (tem) setFeitas((f) => new Set(f).add(5))
        })
    check()
    const ch = supabase
      .channel('alertas-tut')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas', filter: `motor_id=eq.${motorSim.id}` }, check)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [motorSim])

  useEffect(() => {
    if (sim.current) {
      sim.current.carga = carga / 100
      sim.current.comRot = comRot
    }
  }, [carga, comRot])

  useEffect(() => () => sim.current?.parar(), [])

  async function criarMotor() {
    setErro(null)
    if (!podeEditar) return setErro('O modo simulação exige papel admin ou master.')
    if (!perfil?.conta_id) return setErro('Seu perfil ainda não está ligado a uma conta.')
    const tag = 'M-SIM-' + Math.random().toString(36).slice(2, 5).toUpperCase()
    const { data: m, error } = await supabase
      .from('motores')
      .insert({ conta_id: perfil.conta_id, tag, nome: 'Bomba centrífuga · bancada virtual', fabricante: 'WEG', modelo: 'W22', potencia_cv: 1, tensao_nominal_v: 220, corrente_nominal_a: 10.5, rpm_nominal: 1740, aplicacao: 'fixa', simulado: true })
      .select()
      .single()
    if (error) return setErro(error.message)
    const token = novoToken()
    const { error: e2 } = await supabase.from('coletores').insert({ motor_id: m.id, tipo: 'eixo', protocolo: 'post', token_hash: await sha256Hex(token) })
    if (e2) return setErro(e2.message)
    try {
      sessionStorage.setItem('eixo-token-' + m.id, token)
    } catch {
      /* sem storage */
    }
    setMotorSim(m as Motor)
    setFeitas((f) => new Set(f).add(1))
  }

  async function ligarColetor() {
    if (!motorSim) return
    if (!podeEditar) return setErro('O modo simulação exige papel admin ou master.')
    let token: string | null = null
    try {
      token = sessionStorage.getItem('eixo-token-' + motorSim.id)
    } catch {
      /* sem storage */
    }
    if (!token) {
      // token perdido (outra sessão): gera um novo e grava o hash
      token = novoToken()
      const { error } = await supabase.from('coletores').update({ token_hash: await sha256Hex(token) }).eq('motor_id', motorSim.id)
      if (error) return setErro(error.message)
      try {
        sessionStorage.setItem('eixo-token-' + motorSim.id, token)
      } catch {
        /* sem storage */
      }
    }
    sim.current?.parar()
    const c = new ColetorVirtual(token)
    c.carga = carga / 100
    c.comRot = comRot
    c.onTick = () => setTick((t) => t + 1)
    c.iniciar()
    sim.current = c
    setFeitas((f) => new Set(f).add(2))
    setTimeout(recarregar, 1500)
  }

  function desligar() {
    sim.current?.parar()
    setTick((t) => t + 1)
  }

  const ativo = sim.current?.ativo ?? false
  const medidas = useMemo(() => (comRot ? (['temp', 'corr', 'vib', 'rot'] as const) : (['temp', 'corr', 'vib'] as const)), [comRot])
  const sev = pior(regras, ultima, [...medidas])
  const N = ETAPAS.length

  function proxima() {
    if (etapa === 1 && !motorSim) return setErro('Crie o motor virtual antes de avançar.')
    if (etapa === 2 && !ativo) return setErro('Ligue o coletor virtual antes de avançar.')
    if (etapa === 5 && !feitas.has(5)) return setErro('Suba a carga e aguarde o alerta crítico aparecer.')
    setErro(null)
    setFeitas((f) => new Set(f).add(etapa))
    if (etapa < N - 1) setEtapa(etapa + 1)
  }

  const corpo = () => {
    switch (etapa) {
      case 0:
        return (
          <Link to="/painel" className="btn btn-secondary btn-sm">
            Abrir a Visão geral
          </Link>
        )
      case 1:
        return motorSim ? (
          <p className="pill ok">Motor virtual {motorSim.tag} pronto</p>
        ) : (
          <button className="btn btn-primary" onClick={criarMotor} disabled={!podeEditar}>
            Criar motor virtual
          </button>
        )
      case 2:
        return (
          <div className="row">
            {ativo ? (
              <>
                <span className="pill ok">
                  <span className="dot" /> enviando · {sim.current?.enviados} leituras
                </span>
                <button className="btn btn-ghost btn-sm" onClick={desligar}>
                  Desligar
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={ligarColetor} disabled={!motorSim || !podeEditar}>
                Ligar coletor virtual
              </button>
            )}
            {sim.current?.ultimoErro && <span className="err">{sim.current.ultimoErro}</span>}
          </div>
        )
      case 3:
        return (
          <div className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span>■ zona A/B normal</span>
            <span style={{ color: 'var(--warn)' }}>■ zona C atenção</span>
            <span style={{ color: 'var(--crit)' }}>■ zona D crítico</span>
          </div>
        )
      case 4:
        return (
          <>
            <div className="progress" style={{ marginBottom: 8 }}>
              <i style={{ width: Math.min(100, ((status?.dias ?? 0) / 14) * 100) + '%' }} />
            </div>
            <span className="muted num">
              {status?.dias ?? 0} de 14 dias · {status?.n_leituras ?? 0} leituras válidas · fase {status?.fase ?? 1}
            </span>
          </>
        )
      case 5:
        return feitas.has(5) ? <span className="pill crit">Alerta disparado. Avance.</span> : <span className="pill warn">Aguardando alerta…</span>
      default:
        return (
          <Link to="/alertas" className="btn btn-secondary btn-sm">
            Abrir alertas {alertaAtivo ? '(1 ativo)' : ''}
          </Link>
        )
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Caminho de Tutorial · modo simulação</p>
          <h1>Aprenda com um motor virtual</h1>
          <p className="muted">Nenhum hardware é necessário. O coletor virtual usa o mesmo endpoint, token e banco que um ESP32 real.</p>
        </div>
        {motorSim && <span className="pill sim">{motorSim.tag}</span>}
      </div>

      {!podeEditar && (
        <div className="banner">
          <div className="sev warn">!</div>
          <div>
            <b>Somente visualização.</b>{' '}
            <span className="muted">
              O modo simulação cria um motor e liga um coletor virtual na empresa, por isso exige papel admin ou master. Você pode ler as etapas e acompanhar
              um motor virtual que já exista.
            </span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h">
          <h3>Progresso</h3>
          <span className="muted num">
            {feitas.size} de {N} etapas
          </span>
        </div>
        <div className="progress" style={{ marginBottom: 14 }}>
          <i style={{ width: (feitas.size / N) * 100 + '%' }} />
        </div>
        <div className="path">
          {ETAPAS.map(([s], i) => (
            <div key={s} className={'pt ' + (feitas.has(i) ? 'done' : '') + (i === etapa ? ' cur' : '')} onClick={() => setEtapa(i)} style={{ cursor: 'pointer' }}>
              <div className="ic">{feitas.has(i) ? '✓' : i + 1}</div>
              {s}
            </div>
          ))}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr' }}>
        <div className="card">
          <p className="eyebrow">
            Etapa {etapa + 1} de {N}
          </p>
          <h2 style={{ margin: '4px 0 8px' }}>{ETAPAS[etapa][1]}</h2>
          <p className="muted" style={{ marginBottom: 14 }}>
            {ETAPAS[etapa][2]}
          </p>
          <div style={{ marginBottom: 16 }}>{corpo()}</div>
          {erro && (
            <p className="err" style={{ marginBottom: 10 }}>
              {erro}
            </p>
          )}
          <div className="row">
            <button className="btn btn-ghost" disabled={etapa === 0} onClick={() => setEtapa(etapa - 1)}>
              Voltar
            </button>
            <button className="btn btn-primary btn-hero" onClick={proxima}>
              {etapa === N - 1 ? '✓ Concluir' : 'Próxima etapa →'}
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h3>Motor virtual</h3>
            <span className={'pill ' + sev}>{ultima ? SEV_LABEL[sev] : 'Sem dados'}</span>
          </div>
          <div className="grid g2" style={{ marginBottom: 12 }}>
            {(['corr', 'vib', 'temp'] as const).map((g) => (
              <Gauge key={g} g={g} valor={ultima?.[g]} sev={severidade(regras, g, ultima?.[g])} />
            ))}
            {comRot ? <Gauge g="rot" valor={ultima?.rot} sev={severidade(regras, 'rot', ultima?.rot)} /> : <NaoMedido g="rot" />}
          </div>
          <label htmlFor="carga" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            Carga aplicada ao eixo: <span className="num">{carga} %</span>
          </label>
          <input id="carga" type="range" min={0} max={100} value={carga} onChange={(e) => setCarga(+e.target.value)} />
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
            <span>vazio</span>
            <span>nominal</span>
            <span>sobrecarga</span>
          </div>
          <div className="ind-row" style={{ marginTop: 12 }}>
            <div className="t">
              <b>Simular coletor com rotação</b>
              <small>Como se o inversor enviasse "rot". Permite baseline por velocidade.</small>
            </div>
            <button className={'switch ' + (comRot ? 'on' : '')} aria-label="Enviar rotação" onClick={() => setComRot(!comRot)} />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {ativo ? `Coletor virtual ativo · ${sim.current?.enviados ?? 0} leituras enviadas` : 'Coletor virtual desligado'}
            <span hidden>{tick}</span>
          </p>
        </div>
      </div>
    </>
  )
}
