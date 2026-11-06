import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Gauge } from '../components/Gauge'
import { LineChart } from '../components/LineChart'
import { MotorSvg, PONTOS, nomePonto, type PontoId, type StatusColetor } from '../components/MotorSvg'
import { useAuth } from '../lib/auth'
import { PROGRESSO_VAZIO, limparProgresso, lerProgresso, salvarDecisaoGuia, salvarProgresso, type ConfigColetorGuia, type ProgressoGuia } from '../lib/guia'
import { backendLocal, backendReal, type DadosMotor } from '../lib/guiaBackend'
import { SENSORES, ZONAS_VIB, avaliarPonto, cobertura } from '../lib/guiaConteudo'
import { ColetorVirtual, SENSORES_EIXO, amostra } from '../lib/sim'
import { novoToken } from '../lib/supabase'
import { GRANDEZAS, SEV_LABEL, fmt, pior, severidade, type AcaoCorretiva, type Alerta, type Grandeza, type Leitura, type Motor, type Regra, type StatusAprendizado } from '../lib/types'
import '../guia.css'

const URL_INGEST = (import.meta.env.VITE_SUPABASE_URL as string) + '/rest/v1/rpc/ingest'

const ETAPAS = [
  ['Início', 'Bem-vindo ao guia interativo'],
  ['Motor', 'Cadastre o motor'],
  ['Coletor', 'Configure o coletor e gere a chave'],
  ['Instalação', 'Instale os sensores no motor'],
  ['Conexão', 'Conecte o coletor à plataforma'],
  ['Tempo real', 'Acompanhe as leituras'],
  ['Aprendizado', 'Como a plataforma aprende o normal'],
  ['Sobrecarga', 'Provoque uma sobrecarga'],
  ['Alerta', 'Trate o alerta'],
  ['Conclusão', 'Pronto para operar'],
] as const
const N = ETAPAS.length

const MOTOR_PADRAO = { tag: 'M-GUIA', nome: 'Bomba centrífuga · linha de demonstração', fabricante: 'WEG', modelo: 'W22', potencia_cv: '1', tensao_nominal_v: '220', corrente_nominal_a: '10,5', rpm_nominal: '1740', aplicacao: 'fixa' as 'fixa' | 'multispeed' }
const CFG_PADRAO: ConfigColetorGuia = { tipo: 'eixo', protocolo: 'post', sensores: { ...SENSORES_EIXO } }
const REDES = ['OFICINA-2G', 'MANUTENCAO', 'VISITANTES']

const chaveSessao = (motorId: string) => 'eixo-token-' + motorId
function lerChave(motorId: string | null) {
  if (!motorId) return null
  try {
    return sessionStorage.getItem(chaveSessao(motorId))
  } catch {
    return null
  }
}
function guardarChave(motorId: string, chave: string) {
  try {
    sessionStorage.setItem(chaveSessao(motorId), chave)
  } catch {
    /* sem storage */
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function Guia() {
  const nav = useNavigate()
  const { session, perfil, podeEditar } = useAuth()
  const uid = session?.user.id
  const local = !podeEditar
  const backend = local ? backendLocal : backendReal

  const [prog, setProgState] = useState<ProgressoGuia>(() => {
    const p = lerProgresso(uid)
    return p && p.local === local ? p : { ...PROGRESSO_VAZIO, local }
  })
  const setProg = useCallback((f: (p: ProgressoGuia) => ProgressoGuia) => setProgState((p) => f(p)), [])
  useEffect(() => salvarProgresso(uid, prog), [uid, prog])

  const etapa = prog.etapa
  const feitas = useMemo(() => new Set(prog.feitas), [prog.feitas])
  const marcar = (i: number) => setProg((p) => (p.feitas.includes(i) ? p : { ...p, feitas: [...p.feitas, i] }))
  const irPara = (i: number) => setProg((p) => ({ ...p, etapa: i }))

  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // ---- motor ----
  const [motor, setMotor] = useState<Motor | null>(null)
  const [regras, setRegras] = useState<Regra[]>([])
  const [status, setStatus] = useState<StatusAprendizado | null>(null)
  const [fm, setFm] = useState(MOTOR_PADRAO)
  const [carregandoMotor, setCarregandoMotor] = useState(!!prog.motorId)

  useEffect(() => {
    if (!prog.motorId) return
    let vivo = true
    backend.carregarMotor(prog.motorId).then(async (m) => {
      if (!vivo) return
      if (!m) {
        // motor removido (ou modo demonstração reiniciado): volta ao começo
        setProgState({ ...PROGRESSO_VAZIO, local })
        setAviso(local ? 'O modo demonstração reinicia a cada sessão do navegador. Vamos começar de novo.' : 'O motor virtual deste guia não existe mais. Vamos começar de novo.')
      } else {
        setMotor(m)
        setRegras(await backend.regras(m.id))
        setStatus(await backend.status(m.id))
      }
      setCarregandoMotor(false)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prog.motorId])

  // ---- coletor ----
  const [cfg, setCfg] = useState<ConfigColetorGuia>(prog.config ?? CFG_PADRAO)
  const [chave, setChave] = useState<string | null>(() => lerChave(prog.motorId))
  const [copiado, setCopiado] = useState(false)
  const sensoresAtivos = useMemo(() => (['temp', 'corr', 'vib', 'rot', 'tens'] as Grandeza[]).filter((g) => cfg.sensores[g]), [cfg])
  const aplicacao = motor?.aplicacao ?? fm.aplicacao
  const cob = useMemo(() => cobertura(cfg.sensores, aplicacao), [cfg, aplicacao])

  // ---- instalação ----
  const [sensorSel, setSensorSel] = useState<Grandeza | null>(null)
  const [veredito, setVeredito] = useState<{ g: Grandeza; ponto: PontoId; ok: boolean; texto: string } | null>(null)
  useEffect(() => {
    if (etapa !== 3 || sensorSel) return
    const pend = sensoresAtivos.find((g) => !prog.montagem[g])
    if (pend) setSensorSel(pend)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa])
  const montagemOk = sensoresAtivos.every((g) => {
    const p = prog.montagem[g]
    return p && avaliarPonto(g, p as PontoId, aplicacao).ok
  })

  // ---- conexão / coletor virtual ----
  const sim = useRef<ColetorVirtual | null>(null)
  const [tick, setTick] = useState(0)
  const [carga, setCarga] = useState(40)
  const [rede, setRede] = useState(REDES[0])
  const [chaveDigitada, setChaveDigitada] = useState('')
  const [log, setLog] = useState<{ t: string; c?: 'ok' | 'err' | 'dim' }[]>([])
  const [conectando, setConectando] = useState(false)
  const [mostrarChave, setMostrarChave] = useState(false)
  const ativo = sim.current?.ativo ?? false

  useEffect(() => {
    if (sim.current) sim.current.carga = carga / 100
  }, [carga])
  useEffect(() => () => sim.current?.parar(), [])

  // ---- leituras, alertas, ações ----
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [acoes, setAcoes] = useState<AcaoCorretiva[]>([])
  const [acaoTxt, setAcaoTxt] = useState('')
  const [toast, setToast] = useState<Alerta | null>(null)
  const alertaAtivo = alertas.find((a) => a.status === 'ativo') ?? null
  const alertaGuia = alertaAtivo ?? alertas.find((a) => a.status === 'reconhecido') ?? null

  useEffect(() => {
    if (!motor) return
    const off1 = backend.assinarLeituras(motor.id, 120, setLeituras)
    const off2 = backend.assinarAlertas(motor.id, setAlertas)
    backend.acoes().then(setAcoes)
    return () => {
      off1()
      off2()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor?.id])

  useEffect(() => {
    if (!alertaAtivo) return
    if (!feitas.has(7)) {
      marcar(7)
      setToast(alertaAtivo)
      const t = setTimeout(() => setToast(null), 6000)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertaAtivo?.id])

  useEffect(() => {
    if (!motor || (etapa !== 6 && etapa !== 5)) return
    const t = setInterval(() => backend.status(motor.id).then(setStatus), 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motor?.id, etapa])

  const ultima = leituras[leituras.length - 1] ?? null
  const medidas = useMemo<Grandeza[]>(() => sensoresAtivos.filter((g) => ultima == null || ultima[g] != null), [sensoresAtivos, ultima])
  const sev = pior(regras, ultima, medidas)
  const regraVib = regras.find((r) => r.grandeza === 'vib')
  const seguidas = useMemo(() => {
    if (!regraVib) return 0
    let n = 0
    for (let i = leituras.length - 1; i >= 0 && n < (regraVib.persistencia ?? 3); i--) {
      if ((leituras[i].vib ?? 0) >= regraVib.limite_critico) n++
      else break
    }
    return n
  }, [leituras, regraVib])
  const zonaVib = ultima?.vib == null ? null : ultima.vib < 1.8 ? 'A' : ultima.vib < 2.8 ? 'B' : ultima.vib < 4.5 ? 'C' : 'D'

  const statusColetor: StatusColetor = !prog.chaveGerada ? 'nenhum' : ativo ? (sim.current?.ultimoErro ? 'erro' : 'online') : conectando ? 'conectando' : 'configurado'

  /* ------------------------------------------------------------------ */
  /* ações                                                               */
  /* ------------------------------------------------------------------ */

  async function cadastrarMotor(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const num = (s: string) => (s.trim() ? +s.replace(',', '.') : null)
    const inA = num(fm.corrente_nominal_a)
    if (!inA || inA <= 0) return setErro('Informe a corrente nominal da placa do motor.')
    setOcupado(true)
    try {
      const d: DadosMotor = {
        tag: fm.tag.trim() + (local ? '' : '-' + Math.random().toString(36).slice(2, 5).toUpperCase()),
        nome: fm.nome.trim(),
        fabricante: fm.fabricante.trim(),
        modelo: fm.modelo.trim(),
        potencia_cv: num(fm.potencia_cv),
        tensao_nominal_v: num(fm.tensao_nominal_v),
        corrente_nominal_a: inA,
        rpm_nominal: num(fm.rpm_nominal),
        aplicacao: fm.aplicacao,
      }
      const m = await backend.criarMotor(perfil?.conta_id ?? null, d)
      setMotor(m)
      setRegras(await backend.regras(m.id))
      setStatus(await backend.status(m.id))
      setProg((p) => ({ ...p, motorId: m.id, feitas: [...new Set([...p.feitas, 1])] }))
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  function alternarSensor(g: Grandeza) {
    if (cfg.tipo === 'eixo' && SENSORES.find((s) => s.g === g)?.padraoEixo) return
    setCfg((c) => ({ ...c, sensores: { ...c.sensores, [g]: !c.sensores[g] } }))
  }

  function mudarTipo(tipo: 'eixo' | 'terceiro') {
    setCfg((c) => (tipo === 'eixo' ? { ...c, tipo, sensores: { ...c.sensores, temp: true, corr: true, vib: true } } : { ...c, tipo }))
  }

  async function gerarChave() {
    if (!motor) return
    setErro(null)
    setOcupado(true)
    try {
      const t = novoToken()
      await backend.salvarColetor(motor.id, cfg, t)
      guardarChave(motor.id, t)
      setChave(t)
      // sensores mudaram: a instalação anterior deixa de valer para os que saíram
      setProg((p) => ({ ...p, config: cfg, chaveGerada: true, montagem: Object.fromEntries(Object.entries(p.montagem).filter(([g]) => cfg.sensores[g as Grandeza])), feitas: [...new Set([...p.feitas, 2])] }))
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function salvarSensores() {
    if (!motor) return
    setErro(null)
    try {
      await backend.atualizarSensores(motor.id, cfg)
      if (sim.current) sim.current.sensores = cfg.sensores
      setProg((p) => ({ ...p, config: cfg, montagem: Object.fromEntries(Object.entries(p.montagem).filter(([g]) => cfg.sensores[g as Grandeza])) }))
      setAviso('Sensores do coletor atualizados.')
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  const cfgMudou = prog.config != null && JSON.stringify(prog.config) !== JSON.stringify(cfg)

  function copiar(txt: string) {
    navigator.clipboard?.writeText(txt).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    })
  }

  function escolherPonto(ponto: PontoId) {
    if (!sensorSel) return setAviso('Primeiro escolha, na lista, qual sensor você vai instalar.')
    setAviso(null)
    const v = avaliarPonto(sensorSel, ponto, aplicacao)
    setVeredito({ g: sensorSel, ponto, ...v })
    if (v.ok) {
      setProg((p) => ({ ...p, montagem: { ...p.montagem, [sensorSel]: ponto } }))
      const prox = sensoresAtivos.find((g) => g !== sensorSel && !prog.montagem[g])
      setSensorSel(prox ?? null)
    }
  }

  async function conectar(e: FormEvent) {
    e.preventDefault()
    if (!motor) return
    const digitada = chaveDigitada.trim()
    setConectando(true)
    setErro(null)
    const linhas: { t: string; c?: 'ok' | 'err' | 'dim' }[] = []
    const escrever = (t: string, c?: 'ok' | 'err' | 'dim') => {
      linhas.push({ t, c })
      setLog([...linhas])
    }
    setLog([])
    escrever('> gravando configuração… ok', 'dim')
    await esperar(500)
    escrever(`> conectando à rede ${rede}… ok (IP 192.168.0.47)`, 'dim')
    await esperar(650)
    escrever('> sincronizando o relógio (NTP)… ok', 'dim')
    await esperar(500)
    escrever('> autenticando na plataforma…')
    await esperar(400)
    if (!digitada) {
      escrever('  falha: chave do coletor vazia. Cole a chave gerada na etapa anterior.', 'err')
      setConectando(false)
      return
    }
    try {
      sim.current?.parar()
      const c = new ColetorVirtual(digitada, backend.enviar)
      c.carga = carga / 100
      c.sensores = cfg.sensores
      // a primeira leitura valida a chave: só depois o envio contínuo começa
      await backend.enviar(digitada, { ...amostra(carga / 100, cfg.sensores), boot: 1, seq: 0, device_id: 'guia-' + motor.tag.toLowerCase() })
      escrever('  ok · chave aceita, coletor vinculado ao motor ' + motor.tag, 'ok')
      await esperar(400)
      escrever('> enviando leituras a 1 Hz (POST ' + new URL(URL_INGEST).host + ')', 'ok')
      c.onTick = () => setTick((t) => t + 1)
      c.iniciar()
      sim.current = c
      guardarChave(motor.id, digitada)
      setChave(digitada)
      setProg((p) => ({ ...p, conectou: true, feitas: [...new Set([...p.feitas, 4])] }))
    } catch (err) {
      const msg = (err as Error).message
      if (/token|28000|inválid/i.test(msg)) {
        escrever('  falha 401 · chave inválida. A plataforma guarda só o hash da chave: cole-a exatamente como foi gerada.', 'err')
      } else {
        escrever('  falha · ' + msg, 'err')
      }
    } finally {
      setConectando(false)
    }
  }

  function reconectar() {
    if (!motor || !chave) return
    sim.current?.parar()
    const c = new ColetorVirtual(chave, backend.enviar)
    c.carga = carga / 100
    c.sensores = cfg.sensores
    c.onTick = () => setTick((t) => t + 1)
    c.iniciar()
    sim.current = c
    setTick((t) => t + 1)
  }

  function desligar() {
    sim.current?.parar()
    setTick((t) => t + 1)
  }

  async function novaChave() {
    if (!motor) return
    setErro(null)
    try {
      const t = novoToken()
      await backend.rotacionarChave(motor.id, t)
      guardarChave(motor.id, t)
      setChave(t)
      setMostrarChave(true)
      setAviso('Nova chave gerada. A anterior deixou de valer.')
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  async function reconhecer() {
    if (!alertaAtivo) return
    setErro(null)
    try {
      await backend.reconhecer(alertaAtivo.id, uid, acaoTxt)
      setAcaoTxt('')
      setProg((p) => ({ ...p, alertaTratado: true, feitas: [...new Set([...p.feitas, 8])] }))
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  async function concluir(remover: boolean) {
    setOcupado(true)
    try {
      sim.current?.parar()
      if (remover && motor) await backend.removerMotor(motor.id)
      await salvarDecisaoGuia(uid, 'concluido')
      limparProgresso(uid)
      nav(remover || local ? '/motores' : '/motores/' + motor?.id)
    } catch (err) {
      setErro((err as Error).message)
      setOcupado(false)
    }
  }

  function reiniciar() {
    sim.current?.parar()
    limparProgresso(uid)
    setProgState({ ...PROGRESSO_VAZIO, local })
    setMotor(null)
    setRegras([])
    setLeituras([])
    setAlertas([])
    setChave(null)
    setCfg(CFG_PADRAO)
    setFm(MOTOR_PADRAO)
    setLog([])
    setChaveDigitada('')
    setVeredito(null)
    setErro(null)
    setAviso(null)
  }

  /* ------------------------------------------------------------------ */
  /* navegação                                                           */
  /* ------------------------------------------------------------------ */

  function bloqueio(i: number): string | null {
    switch (i) {
      case 1:
        return motor ? null : 'Cadastre o motor para continuar.'
      case 2:
        return prog.chaveGerada ? null : sensoresAtivos.length === 0 ? 'Ligue pelo menos um sensor.' : 'Gere a chave do coletor para continuar.'
      case 3:
        return montagemOk ? null : 'Instale todos os sensores em um ponto adequado.'
      case 4:
        return prog.conectou ? null : 'Conecte o coletor com a chave gerada.'
      case 5:
        return leituras.length >= 5 ? null : 'Aguarde algumas leituras chegarem.'
      case 7:
        return feitas.has(7) ? null : 'Suba a carga e aguarde o alerta crítico.'
      case 8:
        return prog.alertaTratado ? null : 'Reconheça o alerta e registre a ação.'
      default:
        return null
    }
  }

  function proxima() {
    const b = bloqueio(etapa)
    if (b) return setErro(b)
    setErro(null)
    setAviso(null)
    marcar(etapa)
    if (etapa < N - 1) irPara(etapa + 1)
  }

  const podeIr = (i: number) => i <= etapa || feitas.has(i - 1) || feitas.has(i)

  /* ------------------------------------------------------------------ */
  /* conteúdo das etapas                                                 */
  /* ------------------------------------------------------------------ */

  const callout = (nivel: 'ok' | 'warn' | 'crit' | 'info', ic: string, children: React.ReactNode) => (
    <div className={'callout ' + nivel}>
      <span className="ic">{ic}</span>
      <div>{children}</div>
    </div>
  )

  const campo = (k: keyof typeof MOTOR_PADRAO, label: string, props: Record<string, unknown> = {}) => (
    <div className="field">
      <label htmlFor={'g-' + k}>{label}</label>
      <input id={'g-' + k} value={fm[k]} onChange={(e) => setFm({ ...fm, [k]: e.target.value })} {...props} />
    </div>
  )

  function corpo() {
    switch (etapa) {
      case 0:
        return (
          <>
            <p className="lead">
              Em cerca de cinco minutos você vai percorrer o mesmo caminho de quem coloca um motor real sob supervisão: cadastrar o motor, configurar o coletor, instalar os sensores,
              conectar com a chave gerada, acompanhar as leituras e tratar um alerta. Tudo acontece com um <b>motor virtual</b>, sem nenhum hardware.
            </p>
            <div className="lista-etapas">
              {[
                ['Cadastro do motor', 'Dados de placa que definem os limites de alarme.'],
                ['Coletor e sensores', 'Escolha o que medir e entenda o que cada escolha cobre ou deixa de cobrir.'],
                ['Instalação e conexão', 'Onde fixar cada sensor e como o coletor se autentica com a chave.'],
                ['Operação', 'Leituras em tempo real, aprendizado do normal, sobrecarga, alerta e ação corretiva.'],
              ].map(([t, d], i) => (
                <div key={t}>
                  <span className="n">{i + 1}</span>
                  <div>
                    <b>{t}</b>
                    <small>{d}</small>
                  </div>
                </div>
              ))}
            </div>
            {local
              ? callout('info', 'i', <>Seu perfil é de visualização, então o guia roda em <b>modo demonstração</b>: o motor virtual existe só neste navegador e nada é gravado na empresa.</>)
              : callout('info', 'i', <>O motor virtual é cadastrado na sua empresa, marcado como <b>simulado</b>, e aparece na Visão geral como qualquer outro. No fim você decide se o mantém ou remove.</>)}
          </>
        )

      case 1:
        return motor ? (
          <>
            <p className="lead">Motor cadastrado. A partir dos dados de placa a plataforma criou as regras da fase 1, os limites fixos que valem enquanto o normal deste motor ainda não foi aprendido.</p>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-h">
                <h3>
                  {motor.tag} · {motor.nome}
                </h3>
                <span className="pill ok">cadastrado</span>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>
                {[motor.fabricante, motor.modelo, motor.potencia_cv && motor.potencia_cv + ' cv', motor.tensao_nominal_v && motor.tensao_nominal_v + ' V', 'In ' + motor.corrente_nominal_a + ' A', motor.rpm_nominal && motor.rpm_nominal + ' rpm', motor.aplicacao === 'multispeed' ? 'multispeed (inversor)' : 'velocidade fixa'].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Grandeza</th>
                    <th>Atenção</th>
                    <th>Crítico</th>
                    <th>De onde vem</th>
                  </tr>
                </thead>
                <tbody>
                  {(['vib', 'corr', 'temp'] as Grandeza[]).map((g) => {
                    const r = regras.find((x) => x.grandeza === g)
                    if (!r) return null
                    return (
                      <tr key={g}>
                        <td>{GRANDEZAS[g].nome}</td>
                        <td className="num">
                          ≥ {fmt(g, r.limite_atencao)} {GRANDEZAS[g].unidade}
                        </td>
                        <td className="num">
                          ≥ {fmt(g, r.limite_critico)} {GRANDEZAS[g].unidade}
                        </td>
                        <td className="muted">{g === 'vib' ? 'ISO 10816-3, zonas C e D' : g === 'corr' ? '105 % e 115 % da corrente nominal' : 'classe de isolação F'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <form onSubmit={cadastrarMotor}>
            <p className="lead">
              Preencha como na placa do motor. Já deixamos um motor típico preenchido: você pode alterar o que quiser. A <b>corrente nominal</b> define os limites de corrente; a{' '}
              <b>rotação nominal</b> é o que o modelo assume quando o coletor não mede rpm; a <b>aplicação</b> diz se a velocidade varia.
            </p>
            <div className="grid g3" style={{ marginBottom: 12 }}>
              {campo('tag', 'Tag', { required: true })}
              {campo('nome', 'Nome', { required: true })}
              {campo('fabricante', 'Fabricante')}
              {campo('modelo', 'Modelo')}
              {campo('potencia_cv', 'Potência (cv)', { inputMode: 'decimal' })}
              {campo('corrente_nominal_a', 'Corrente nominal (A)', { inputMode: 'decimal', required: true })}
              {campo('tensao_nominal_v', 'Tensão (V)', { inputMode: 'numeric' })}
              {campo('rpm_nominal', 'Rotação nominal (rpm)', { inputMode: 'numeric' })}
              <div className="field">
                <label htmlFor="g-aplicacao">Aplicação</label>
                <select id="g-aplicacao" value={fm.aplicacao} onChange={(e) => setFm({ ...fm, aplicacao: e.target.value as 'fixa' | 'multispeed' })}>
                  <option value="fixa">Velocidade fixa (partida direta / soft-starter)</option>
                  <option value="multispeed">Multispeed (inversor de frequência)</option>
                </select>
              </div>
            </div>
            {fm.aplicacao === 'multispeed' &&
              callout('warn', '!', <>Em aplicação multispeed a vibração muda com a velocidade. Na próxima etapa você verá por que, sem leitura de rotação, a supervisão fica limitada.</>)}
            <button className="btn btn-primary" type="submit" disabled={ocupado}>
              {ocupado ? 'Cadastrando…' : 'Cadastrar motor'}
            </button>
          </form>
        )

      case 2:
        return (
          <>
            <p className="lead">
              Escolha o coletor e os sensores que vão ao motor. A análise ao lado mostra, para esta combinação e para a aplicação <b>{aplicacao === 'multispeed' ? 'multispeed' : 'de velocidade fixa'}</b>, o que a plataforma
              consegue diagnosticar e o que fica descoberto.
            </p>
            <div className="grid g2" style={{ marginBottom: 12 }}>
              <label className={'opt ' + (cfg.tipo === 'eixo' ? 'on' : '')} onClick={() => mudarTipo('eixo')}>
                <span className="radio" />
                <div>
                  <b>Coletor Eixo</b>
                  <br />
                  <span className="muted">Corrente, temperatura e vibração de fábrica. Entradas opcionais para rotação e tensão.</span>
                </div>
              </label>
              <label className={'opt ' + (cfg.tipo === 'terceiro' ? 'on' : '')} onClick={() => mudarTipo('terceiro')}>
                <span className="radio" />
                <div>
                  <b>Coletor próprio ou de terceiro</b>
                  <br />
                  <span className="muted">Qualquer equipamento que envie JSON por HTTPS ou MQTT. Você escolhe o que medir.</span>
                </div>
              </label>
            </div>
            <div className="sensores">
              {SENSORES.map((s) => {
                const on = !!cfg.sensores[s.g]
                const fixo = cfg.tipo === 'eixo' && s.padraoEixo
                return (
                  <div key={s.g} className={'sensor ' + (on ? 'on' : 'off')}>
                    <span className="sw" style={{ background: GRANDEZAS[s.g].cor }} />
                    <div>
                      <b>
                        {s.nome} <span className="mono muted" style={{ fontWeight: 400, fontSize: 11 }}>"{s.chave}"</span>
                        {fixo && <span className="pill ok" style={{ fontSize: 10, padding: '1px 7px' }}>de fábrica</span>}
                      </b>
                      <p>{s.detecta}</p>
                      <div className="inst">
                        <span className="muted">Instalação:</span> {s.instalacao}
                      </div>
                    </div>
                    <button className={'switch ' + (on ? 'on' : '')} aria-label={(on ? 'Desligar ' : 'Ligar ') + s.nome} disabled={fixo} onClick={() => alternarSensor(s.g)} />
                  </div>
                )
              })}
            </div>
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="score">
                <b>Cobertura de diagnóstico</b>
                <div className="progress barra">
                  <i style={{ width: (cob.cobertos / cob.total) * 100 + '%', background: cob.recomendado ? undefined : 'var(--crit)' }} />
                </div>
                <span className="num muted">
                  {cob.cobertos} de {cob.total} padrões
                </span>
                <span className={'pill ' + (cob.recomendado ? 'ok' : 'crit')}>{cob.recomendado ? 'Configuração recomendada' : 'Não recomendado'}</span>
              </div>
              <div className="cobertura">
                {cob.itens.map((it) => (
                  <div key={it.titulo} className={'cov ' + it.nivel}>
                    <span className="ic">{it.nivel === 'ok' ? '✓' : it.nivel === 'crit' ? '✕' : it.nivel === 'warn' ? '!' : 'i'}</span>
                    <div>
                      <b>{it.titulo}</b>
                      <p>{it.texto}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid g2" style={{ marginBottom: 12 }}>
              <label className={'opt ' + (cfg.protocolo === 'post' ? 'on' : '')} onClick={() => setCfg({ ...cfg, protocolo: 'post' })}>
                <span className="radio" />
                <div>
                  <b>POST HTTPS</b>
                  <br />
                  <span className="muted">O coletor envia um JSON a cada leitura, ou em lote quando a rede volta.</span>
                </div>
              </label>
              <label className={'opt ' + (cfg.protocolo === 'mqtt' ? 'on' : '')} onClick={() => setCfg({ ...cfg, protocolo: 'mqtt' })}>
                <span className="radio" />
                <div>
                  <b>MQTT</b>
                  <br />
                  <span className="muted">Publicação em tópico no broker Eixo ou no seu. Disponível em breve; o guia usa POST.</span>
                </div>
              </label>
            </div>
            {!prog.chaveGerada ? (
              <>
                {!cob.recomendado && callout('crit', '✕', <>Você pode gerar a chave mesmo assim, mas a plataforma vai avisar sobre a limitação na página do motor. Para a aplicação atual, o ideal é ligar os sensores marcados em vermelho.</>)}
                <button className="btn btn-primary btn-hero" onClick={gerarChave} disabled={ocupado || !motor || sensoresAtivos.length === 0}>
                  {ocupado ? 'Gerando…' : 'Gerar chave do coletor'}
                </button>
              </>
            ) : (
              <>
                <div className="chave-box">
                  <b>Chave do coletor</b>
                  {chave ? <code>{chave}</code> : <span className="muted">A chave foi exibida em outra sessão e não é guardada em texto. Gere outra, se precisar.</span>}
                  <div className="row">
                    {chave && (
                      <button className="btn btn-secondary btn-sm" onClick={() => copiar(chave)}>
                        {copiado ? 'Copiada' : 'Copiar chave'}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={novaChave}>
                      Gerar outra
                    </button>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Esta chave identifica o coletor junto ao motor {motor?.tag}. A plataforma guarda só o hash dela: quem perde a chave gera outra, e a antiga deixa de valer. Na próxima etapa você vai colá-la na configuração do coletor.
                  </span>
                </div>
                {cfgMudou && (
                  <div className="row" style={{ marginBottom: 10 }}>
                    <span className="muted" style={{ fontSize: 13 }}>
                      Você alterou os sensores depois de gerar a chave.
                    </span>
                    <button className="btn btn-secondary btn-sm" onClick={salvarSensores}>
                      Salvar sensores
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )

      case 3:
        return (
          <>
            <p className="lead">
              Selecione um sensor na lista e clique no ponto do motor onde ele deve ser instalado. Cada escolha recebe uma explicação; só os pontos adequados ficam valendo.
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
              <div className="instalar">
                {sensoresAtivos.map((g) => {
                  const p = prog.montagem[g]
                  const ok = !!p && avaliarPonto(g, p as PontoId, aplicacao).ok
                  return (
                    <button key={g} className={(sensorSel === g ? 'sel ' : '') + (ok ? 'ok' : '')} onClick={() => setSensorSel(g)}>
                      <span className="sw" style={{ background: GRANDEZAS[g].cor }} />
                      <span>
                        {GRANDEZAS[g].nome}
                        <small>{ok ? nomePonto(p) : 'escolha o ponto no desenho'}</small>
                      </span>
                      {ok ? <span className="pill ok">✓</span> : sensorSel === g ? <span className="pill sim">instalando</span> : <span className="pill">pendente</span>}
                    </button>
                  )
                })}
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Depois dos sensores, fixe o coletor perto da caixa de ligação, longe da saída de ar quente, e alimente-o pelo painel.
                </p>
              </div>
              <div>
                <MotorSvg pontos pontoSelecionado={null} onEscolher={escolherPonto} instalados={prog.montagem} coletor={statusColetor} girando={ativo} alerta={!!alertaAtivo} />
                <ul className="pontos-lista">
                  {PONTOS.map((p, i) => (
                    <li key={p.id}>
                      <span className="n">{i + 1}</span>
                      {p.nome}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {veredito &&
              callout(
                veredito.ok ? 'ok' : 'crit',
                veredito.ok ? '✓' : '✕',
                <>
                  <b>
                    {GRANDEZAS[veredito.g].nome} em {nomePonto(veredito.ponto).toLowerCase()}.
                  </b>{' '}
                  {veredito.texto}
                </>,
              )}
            {montagemOk && callout('ok', '✓', <>Todos os sensores estão em pontos adequados. Pode avançar para a conexão.</>)}
          </>
        )

      case 4:
        return (
          <>
            <p className="lead">
              O coletor, ao ser ligado pela primeira vez, abre uma página de configuração. É aqui que a chave gerada entra: cole-a no campo <b>Chave do coletor</b> e conecte. A plataforma
              reconhece o coletor pelo hash da chave e vincula as leituras ao motor {motor?.tag}.
            </p>
            <div className="portal">
              <div className="portal-top">
                <span className="dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="url">http://192.168.4.1 · Coletor Eixo · configuração</span>
              </div>
              <form className="portal-body" onSubmit={conectar}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h4>Rede e plataforma</h4>
                  <div className="field">
                    <label htmlFor="p-rede">Rede Wi-Fi</label>
                    <select id="p-rede" value={rede} onChange={(e) => setRede(e.target.value)}>
                      {REDES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="p-senha">Senha da rede</label>
                    <input id="p-senha" type="password" value="demonstracao" readOnly autoComplete="off" />
                  </div>
                  <div className="field">
                    <label htmlFor="p-url">Endereço da plataforma</label>
                    <input id="p-url" className="mono" style={{ fontSize: 12 }} value={URL_INGEST} readOnly />
                  </div>
                  <div className="field">
                    <label htmlFor="p-chave">Chave do coletor</label>
                    <input id="p-chave" className="mono" value={chaveDigitada} onChange={(e) => setChaveDigitada(e.target.value)} placeholder="cole aqui a chave gerada" autoComplete="off" spellCheck={false} />
                  </div>
                  <div className="row">
                    <button className="btn btn-primary" type="submit" disabled={conectando || ativo}>
                      {conectando ? 'Conectando…' : ativo ? 'Conectado' : 'Salvar e conectar'}
                    </button>
                    {ativo && (
                      <button className="btn btn-ghost btn-sm" type="button" onClick={desligar}>
                        Desligar coletor
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <h4>Console do coletor</h4>
                  <div className="portal-log" aria-live="polite">
                    {log.length === 0 ? <span className="dim">aguardando configuração…</span> : null}
                    {log.map((l, i) => (
                      <div key={i} className={(l.c ?? '') + (i === log.length - 1 && conectando ? ' cur' : '')}>
                        {l.t}
                      </div>
                    ))}
                    {ativo && (
                      <div className="ok">
                        {'  '}leituras enviadas: {sim.current?.enviados}
                        {sim.current?.ultimoErro ? <span className="err"> · erro: {sim.current.ultimoErro}</span> : null}
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </div>
            <details open={mostrarChave} onToggle={(e) => setMostrarChave((e.target as HTMLDetailsElement).open)}>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
                Perdeu a chave? Veja ou gere outra
              </summary>
              <div className="chave-box">
                {chave ? <code>{chave}</code> : <span className="muted">A chave não está guardada neste navegador.</span>}
                <div className="row">
                  {chave && (
                    <button className="btn btn-secondary btn-sm" onClick={() => copiar(chave)}>
                      {copiado ? 'Copiada' : 'Copiar chave'}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={novaChave}>
                    Gerar nova chave
                  </button>
                </div>
              </div>
            </details>
            {callout('info', 'i', <>Em um coletor real a chave fica gravada no dispositivo. Para trocar o coletor de motor, gere uma chave nova na página do motor e reconfigure o aparelho. A chave antiga para de valer na hora.</>)}
          </>
        )

      case 5:
        return (
          <>
            <p className="lead">
              As leituras chegam a cada segundo e atualizam o painel ao lado em tempo real, sem recarregar a página. Mova o controle de <b>carga</b> ao lado e veja corrente, temperatura e vibração reagirem.
              Em 40 % de carga o motor opera na zona B da ISO 10816-3.
            </p>
            <div className="zonas">
              {ZONAS_VIB.map(([z, faixa, desc]) => (
                <div key={z} className={'zona ' + z + (zonaVib === z ? ' cur' : '')}>
                  <b>Zona {z}</b>
                  {faixa}
                  <br />
                  <span style={{ opacity: 0.8 }}>{desc}</span>
                </div>
              ))}
            </div>
            <LineChart
              series={[{ nome: 'Vibração', cor: GRANDEZAS.vib.cor, valores: leituras.map((l) => l.vib) }]}
              limite={regraVib?.limite_critico}
              casas={1}
              rotulosX={leituras.length ? [new Date(leituras[0].ts).toLocaleTimeString('pt-BR'), 'agora'] : []}
              ariaLabel="Histórico de vibração"
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Linha tracejada: limite crítico da fase 1 ({regraVib ? fmt('vib', regraVib.limite_critico) : '4,5'} mm/s). {leituras.length} leituras recebidas.
            </p>
            {!local && motor && (
              <p style={{ marginTop: 12, fontSize: 13 }}>
                Este motor já aparece na <Link to="/painel">Visão geral</Link> e tem a própria página em <Link to={'/motores/' + motor.id}>Motores</Link>, com histórico, limites e dados do coletor. Volte ao guia pelo menu quando quiser.
              </p>
            )}
          </>
        )

      case 6:
        return (
          <>
            <p className="lead">
              A supervisão evolui em três fases. Nos primeiros 14 dias valem os limites fixos que você viu no cadastro. Enquanto isso a plataforma registra o comportamento normal deste motor por hora do dia e dia da semana. Depois,
              um desvio do normal aprendido gera alerta mesmo abaixo do limite fixo.
            </p>
            <div className="fases">
              {[
                ['Fase 1', 'Limites fixos', 'ISO 10816-3, porcentagem da corrente nominal e classe de isolação. Alerta após leituras seguidas acima do limite crítico.'],
                ['Fase 2', 'Linha de base aprendida', 'Média e desvio por hora e dia da semana, a partir de 14 dias de dados. Alerta ao sair do envelope de ±2σ.'],
                ['Fase 3', 'Diagnóstico por padrão', 'Combina os desvios em um padrão nomeado (sobrecarga, rolamento, ventilação) e sugere a ação corretiva.'],
              ].map(([f, t, d], i) => (
                <div key={f} className={'fase ' + ((status?.fase ?? 1) === i + 1 ? 'cur' : '')}>
                  <p className="eyebrow">{f}</p>
                  <b>{t}</b>
                  <p>{d}</p>
                </div>
              ))}
            </div>
            <div className="progress" style={{ marginBottom: 6 }}>
              <i style={{ width: Math.min(100, ((status?.dias ?? 0) / 14) * 100) + '%' }} />
            </div>
            <span className="muted num" style={{ fontSize: 12 }}>
              {status?.dias ?? 0} de 14 dias · {status?.n_leituras ?? leituras.length} leituras válidas · fase {status?.fase ?? 1} ativa
            </span>
            {aplicacao === 'multispeed' && !cfg.sensores.rot
              ? callout('crit', '✕', <>Este motor é multispeed e o coletor não mede rotação: a linha de base seria aprendida com velocidades misturadas e perderia o sentido. A plataforma monitora, mas marca o motor com o aviso <b>Multispeed sem rpm</b> na Visão geral.</>)
              : cfg.sensores.rot
                ? callout('ok', '✓', <>Com rotação medida, a linha de base é aprendida por faixa de velocidade: cada velocidade tem o próprio normal.</>)
                : callout('info', 'i', <>Velocidade fixa sem rotação: o normal é um só, na velocidade nominal de {motor?.rpm_nominal ?? '–'} rpm.</>)}
          </>
        )

      case 7:
        return (
          <>
            <p className="lead">
              Arraste a <b>carga</b> ao lado para 80 % ou mais. Corrente e vibração sobem juntas e a vibração entra na zona D. A plataforma só abre o alerta quando{' '}
              <b>{regraVib?.persistencia ?? 3} leituras válidas seguidas</b> passam do limite crítico: um pico isolado não gera alarme.
            </p>
            <div className="row" style={{ alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13 }}>
                Leituras seguidas acima de {regraVib ? fmt('vib', regraVib.limite_critico) : '4,5'} mm/s:
              </span>
              <div className="persist" aria-label={`${seguidas} de ${regraVib?.persistencia ?? 3}`}>
                {Array.from({ length: regraVib?.persistencia ?? 3 }, (_, i) => (
                  <i key={i} className={i < seguidas ? 'on' : ''} />
                ))}
              </div>
              {feitas.has(7) ? <span className="pill crit">Alerta crítico aberto</span> : seguidas > 0 ? <span className="pill warn">acumulando…</span> : <span className="pill">aguardando carga</span>}
            </div>
            {!ativo && callout('warn', '!', <>O coletor virtual está parado. Religue-o no painel ao lado para as leituras voltarem.</>)}
            {feitas.has(7) && callout('crit', '!', <>Alerta aberto: <b>{alertaGuia?.titulo}</b>. {alertaGuia?.mensagem} Avance para tratá-lo.</>)}
          </>
        )

      case 8:
        return (
          <>
            <p className="lead">
              Um alerta traz o diagnóstico, o padrão mais provável e a ação corretiva sugerida. Quem trata registra o que foi feito, e isso fica na Auditoria da empresa. Primeiro, reduza a carga ao lado e veja a vibração
              voltar à zona B. Depois, reconheça o alerta.
            </p>
            {alertaGuia ? (
              <div className="linha-alerta">
                <div className={'sev ' + (alertaGuia.status === 'ativo' ? 'crit' : 'ok')}>{alertaGuia.status === 'ativo' ? '!' : '✓'}</div>
                <div>
                  <p className="eyebrow">Diagnóstico · {motor?.tag}</p>
                  <h3 style={{ margin: '2px 0 6px' }}>{alertaGuia.titulo}</h3>
                  <p className="muted" style={{ fontSize: 13 }}>
                    {alertaGuia.mensagem} Padrão mais provável: sobrecarga mecânica.
                  </p>
                  <p className="eyebrow" style={{ margin: '12px 0 6px' }}>
                    Ação corretiva sugerida
                  </p>
                  <div className="steps">
                    {acoes
                      .filter((a) => a.padrao === 'sobrecarga')
                      .map((ac, i) => (
                        <div key={ac.id} className={'step ' + (i === 0 ? 'cur' : '')}>
                          <span className="n">{ac.ordem}</span>
                          <div>
                            <b>{ac.titulo}</b>
                            <br />
                            <span className="muted">{ac.descricao}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                  {alertaGuia.status === 'ativo' ? (
                    <>
                      <div className="field" style={{ margin: '12px 0 10px' }}>
                        <label htmlFor="g-acao">O que foi feito</label>
                        <input id="g-acao" value={acaoTxt} onChange={(e) => setAcaoTxt(e.target.value)} placeholder="Ex.: carga reduzida para 40 %, vibração voltou a 2,2 mm/s" />
                      </div>
                      <div className="row">
                        <button className="btn btn-primary" onClick={reconhecer}>
                          ✓ Reconhecer e registrar ação
                        </button>
                        {zonaVib && (zonaVib === 'A' || zonaVib === 'B') ? <span className="pill ok">vibração de volta à zona {zonaVib}</span> : <span className="pill warn">reduza a carga: zona {zonaVib ?? '–'}</span>}
                      </div>
                    </>
                  ) : (
                    <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                      Reconhecido {alertaGuia.reconhecido_em && 'em ' + new Date(alertaGuia.reconhecido_em).toLocaleString('pt-BR')}
                      {alertaGuia.acao_registrada && <> · ação: {alertaGuia.acao_registrada}</>}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="muted">Nenhum alerta deste motor ainda.</p>
            )}
            {!local && (
              <p className="muted" style={{ fontSize: 13 }}>
                O mesmo alerta está na tela <Link to="/alertas">Alertas</Link>, e a tratativa aparece na <Link to="/auditoria">Auditoria</Link>.
              </p>
            )}
          </>
        )

      default:
        return (
          <>
            <p className="lead">Você percorreu o ciclo completo da plataforma. Agora é colocar um motor de verdade sob supervisão.</p>
            <div className="resumo-fim">
              {[
                'Cadastrou um motor e viu os limites nascerem dos dados de placa',
                'Configurou o coletor e entendeu o que cada sensor cobre',
                'Instalou os sensores nos pontos certos',
                'Conectou o coletor com a chave e viu as leituras em tempo real',
                'Entendeu as fases do aprendizado e a limitação sem rotação',
                'Provocou uma sobrecarga, recebeu o alerta e registrou a ação',
              ].map((t) => (
                <div key={t}>
                  <span className="ic">✓</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            {local
              ? callout('info', 'i', <>O motor virtual do modo demonstração some ao fechar o navegador. Para cadastrar motores reais, peça ao master da sua empresa o papel de admin.</>)
              : callout('info', 'i', <>O motor virtual {motor?.tag} está na sua empresa, marcado como simulado. Você pode mantê-lo para treinar a equipe ou removê-lo agora, junto com as leituras e o alerta.</>)}
            <div className="row" style={{ marginTop: 14 }}>
              {local ? (
                <button className="btn btn-primary btn-hero" onClick={() => concluir(false)} disabled={ocupado}>
                  Concluir o guia →
                </button>
              ) : (
                <>
                  <button className="btn btn-primary btn-hero" onClick={() => concluir(false)} disabled={ocupado}>
                    Concluir e manter o motor virtual →
                  </button>
                  <button className="btn btn-secondary" onClick={() => concluir(true)} disabled={ocupado}>
                    Concluir e remover o motor virtual
                  </button>
                </>
              )}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Depois, em <b>Motores › Novo motor</b>, o fluxo é o mesmo: dados de placa, coletor, chave e instalação.
            </p>
          </>
        )
    }
  }

  /* ------------------------------------------------------------------ */
  /* layout                                                              */
  /* ------------------------------------------------------------------ */

  if (carregandoMotor) return <p className="muted">Carregando o guia…</p>

  return (
    <>
      <div className="topbar">
        <div className="grow">
          <p className="eyebrow">Guia interativo{local ? ' · modo demonstração' : ''}</p>
          <h1>Do zero ao alerta, com um motor virtual</h1>
        </div>
        {motor && <span className="pill sim">{motor.tag}</span>}
        <span className="muted num" style={{ fontSize: 12 }}>
          {feitas.size} de {N} etapas
        </span>
        <button className="btn btn-ghost btn-sm" onClick={reiniciar} title="Apaga o progresso deste guia (o motor virtual continua cadastrado)">
          Recomeçar
        </button>
        <Link to="/painel" className="btn btn-secondary btn-sm">
          Sair do guia
        </Link>
      </div>

      <div className="guia-grid">
        <nav className="guia-steps" aria-label="Etapas do guia">
          {ETAPAS.map(([s], i) => (
            <button key={s} className={'guia-step' + (feitas.has(i) ? ' done' : '') + (i === etapa ? ' cur' : '')} disabled={!podeIr(i)} onClick={() => irPara(i)}>
              <span className="n">{feitas.has(i) ? '✓' : i + 1}</span>
              <span className="t">{s}</span>
            </button>
          ))}
        </nav>

        <div className="card guia-main" key={etapa}>
          <p className="eyebrow">
            Etapa {etapa + 1} de {N}
          </p>
          <h2>{ETAPAS[etapa][1]}</h2>
          {corpo()}
          {erro && (
            <p className="err" style={{ marginTop: 10 }}>
              {erro}
            </p>
          )}
          {aviso && (
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              {aviso}
            </p>
          )}
          {etapa < N - 1 && (
            <div className="guia-acoes">
              <button className="btn btn-ghost" disabled={etapa === 0} onClick={() => irPara(etapa - 1)}>
                Voltar
              </button>
              <span className="esp" />
              {bloqueio(etapa) && <span className="muted" style={{ fontSize: 12 }}>{bloqueio(etapa)}</span>}
              <button className="btn btn-primary btn-hero" onClick={proxima} disabled={!!bloqueio(etapa)}>
                {etapa === 0 ? 'Começar →' : 'Próxima etapa →'}
              </button>
            </div>
          )}
        </div>

        <aside className="guia-side">
          <div className="card">
            <div className="card-h">
              <h3>Motor virtual</h3>
              <span className={'pill ' + (ultima ? sev : '')}>{ultima ? SEV_LABEL[sev] : 'Sem dados'}</span>
            </div>
            <MotorSvg instalados={prog.montagem} coletor={statusColetor} girando={ativo} alerta={!!alertaAtivo} />
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span className={'pill ' + (statusColetor === 'online' ? 'ok' : statusColetor === 'erro' ? 'crit' : '')}>
                {statusColetor === 'online' && <span className="dot" />}
                {statusColetor === 'nenhum' ? 'Coletor não configurado' : statusColetor === 'configurado' ? 'Coletor aguardando conexão' : statusColetor === 'conectando' ? 'Conectando…' : statusColetor === 'erro' ? 'Falha no envio' : `Online · ${sim.current?.enviados ?? 0} leituras`}
                <span hidden>{tick}</span>
              </span>
              {prog.conectou && !ativo && chave && (
                <button className="btn btn-secondary btn-sm" onClick={reconectar}>
                  Religar coletor
                </button>
              )}
              {ativo && (
                <button className="btn btn-ghost btn-sm" onClick={desligar}>
                  Desligar
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="gauges">
              {(prog.chaveGerada ? sensoresAtivos : (['corr', 'temp', 'vib'] as Grandeza[])).map((g) => (
                <Gauge key={g} g={g} valor={ultima?.[g]} sev={severidade(regras, g, ultima?.[g])} />
              ))}
            </div>
            <label htmlFor="g-carga" style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginTop: 8 }}>
              Carga aplicada ao eixo: <span className="num">{carga} %</span>
            </label>
            <input id="g-carga" type="range" min={0} max={100} value={carga} onChange={(e) => setCarga(+e.target.value)} disabled={!ativo} />
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
              <span>vazio</span>
              <span>nominal</span>
              <span>sobrecarga</span>
            </div>
            {!ativo && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                O controle de carga fica disponível com o coletor conectado.
              </p>
            )}
            {alertaAtivo && (
              <p className="pill crit" style={{ marginTop: 10 }}>
                ! {alertaAtivo.titulo}
              </p>
            )}
          </div>
        </aside>
      </div>

      {toast && (
        <div className="toast" role="status">
          <div className="sev crit">!</div>
          <div>
            <b>Alerta crítico · {motor?.tag}</b>
            <br />
            <span className="muted">{toast.titulo}</span>
          </div>
        </div>
      )}
    </>
  )
}
