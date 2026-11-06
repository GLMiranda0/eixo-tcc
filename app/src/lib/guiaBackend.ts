/**
 * Camada de dados do guia interativo.
 *
 * - `backendReal`: grava o motor virtual, o coletor, as leituras e o alerta no banco da empresa,
 *   exatamente como um motor de produção (exige papel admin ou master).
 * - `backendLocal` (modo demonstração): reproduz as mesmas regras em memória, para quem só
 *   visualiza. Nada sai do navegador.
 */
import type { ConfigColetorGuia } from './guia'
import { ingest, sha256Hex, supabase } from './supabase'
import type { AcaoCorretiva, Alerta, Grandeza, Leitura, Motor, Regra, StatusAprendizado } from './types'

export interface DadosMotor {
  tag: string
  nome: string
  fabricante: string
  modelo: string
  potencia_cv: number | null
  tensao_nominal_v: number | null
  corrente_nominal_a: number
  rpm_nominal: number | null
  aplicacao: 'fixa' | 'multispeed'
}

export interface GuiaBackend {
  readonly local: boolean
  criarMotor(contaId: string | null, d: DadosMotor): Promise<Motor>
  carregarMotor(id: string): Promise<Motor | null>
  regras(motorId: string): Promise<Regra[]>
  /** cria (ou substitui) o coletor do motor com a chave informada */
  salvarColetor(motorId: string, cfg: ConfigColetorGuia, chave: string): Promise<void>
  atualizarSensores(motorId: string, cfg: ConfigColetorGuia): Promise<void>
  rotacionarChave(motorId: string, chave: string): Promise<void>
  /** mesmo caminho do coletor físico */
  enviar(chave: string, payload: Record<string, unknown>): Promise<unknown>
  assinarLeituras(motorId: string, n: number, cb: (ls: Leitura[]) => void): () => void
  assinarAlertas(motorId: string, cb: (as: Alerta[]) => void): () => void
  reconhecer(alertaId: string, uid: string | undefined, acao: string): Promise<void>
  acoes(): Promise<AcaoCorretiva[]>
  status(motorId: string): Promise<StatusAprendizado | null>
  removerMotor(motorId: string): Promise<void>
}

const CAMPOS_SENSOR: Grandeza[] = ['temp', 'corr', 'vib', 'rot', 'tens']

const flagsDe = (cfg: ConfigColetorGuia) => Object.fromEntries(CAMPOS_SENSOR.map((g) => ['mede_' + g, !!cfg.sensores[g]]))

/* ------------------------------------------------------------------ */
/* banco da empresa                                                    */
/* ------------------------------------------------------------------ */

export const backendReal: GuiaBackend = {
  local: false,

  async criarMotor(contaId, d) {
    if (!contaId) throw new Error('Seu perfil ainda não está ligado a uma empresa.')
    const { data, error } = await supabase
      .from('motores')
      .insert({ ...d, conta_id: contaId, simulado: true })
      .select()
      .single()
    if (error) throw new Error(error.message.includes('duplicate') ? 'Já existe um motor com esta tag. Escolha outra.' : error.message)
    return data as Motor
  },

  async carregarMotor(id) {
    const { data } = await supabase.from('motores').select('*').eq('id', id).maybeSingle()
    return (data as Motor | null) ?? null
  },

  async regras(motorId) {
    const { data } = await supabase.from('regras_diagnostico').select('*').eq('motor_id', motorId)
    return (data as Regra[]) ?? []
  },

  async salvarColetor(motorId, cfg, chave) {
    const { error } = await supabase
      .from('coletores')
      .upsert({ motor_id: motorId, tipo: cfg.tipo, protocolo: cfg.protocolo, token_hash: await sha256Hex(chave), ...flagsDe(cfg) }, { onConflict: 'motor_id' })
    if (error) throw new Error(error.message)
  },

  async atualizarSensores(motorId, cfg) {
    const { error } = await supabase.from('coletores').update({ tipo: cfg.tipo, protocolo: cfg.protocolo, ...flagsDe(cfg) }).eq('motor_id', motorId)
    if (error) throw new Error(error.message)
  },

  async rotacionarChave(motorId, chave) {
    const { error } = await supabase.from('coletores').update({ token_hash: await sha256Hex(chave) }).eq('motor_id', motorId)
    if (error) throw new Error(error.message)
  },

  enviar: (chave, payload) => ingest(chave, payload),

  assinarLeituras(motorId, n, cb) {
    let vivo = true
    let lista: Leitura[] = []
    supabase
      .from('leituras')
      .select('*')
      .eq('motor_id', motorId)
      .eq('valida', true)
      .order('ts', { ascending: false })
      .limit(n)
      .then(({ data }) => {
        if (!vivo) return
        lista = ((data as Leitura[]) ?? []).reverse()
        cb(lista)
      })
    const ch = supabase
      .channel('guia-leituras-' + motorId + '-' + Math.random().toString(36).slice(2, 7))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leituras', filter: `motor_id=eq.${motorId}` }, (p) => {
        const l = p.new as Leitura
        if (!l.valida) return
        lista = [...lista, l].slice(-n)
        cb(lista)
      })
      .subscribe()
    return () => {
      vivo = false
      supabase.removeChannel(ch)
    }
  },

  assinarAlertas(motorId, cb) {
    let vivo = true
    const carregar = () =>
      supabase
        .from('alertas')
        .select('*')
        .eq('motor_id', motorId)
        .order('criado_em', { ascending: false })
        .limit(5)
        .then(({ data }) => vivo && cb((data as Alerta[]) ?? []))
    carregar()
    const ch = supabase
      .channel('guia-alertas-' + motorId + '-' + Math.random().toString(36).slice(2, 7))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas', filter: `motor_id=eq.${motorId}` }, carregar)
      .subscribe()
    return () => {
      vivo = false
      supabase.removeChannel(ch)
    }
  },

  async reconhecer(alertaId, uid, acao) {
    const { error } = await supabase
      .from('alertas')
      .update({ status: 'reconhecido', reconhecido_por: uid ?? null, reconhecido_em: new Date().toISOString(), acao_registrada: acao || null })
      .eq('id', alertaId)
    if (error) throw new Error(error.message)
  },

  async acoes() {
    const { data } = await supabase.from('acoes_corretivas').select('*').order('ordem')
    return (data as AcaoCorretiva[]) ?? []
  },

  async status(motorId) {
    const { data } = await supabase.from('status_aprendizado').select('*').eq('motor_id', motorId).maybeSingle()
    return (data as StatusAprendizado | null) ?? null
  },

  async removerMotor(motorId) {
    const { error } = await supabase.from('motores').delete().eq('id', motorId)
    if (error) throw new Error(error.message)
  },
}

/* ------------------------------------------------------------------ */
/* modo demonstração (em memória)                                      */
/* ------------------------------------------------------------------ */

const ACOES_LOCAIS: AcaoCorretiva[] = [
  { id: 'l1', padrao: 'sobrecarga', ordem: 1, titulo: 'Reduzir a carga mecânica aplicada ao eixo', descricao: 'Alivie a carga acoplada (válvula, correia, freio ou setpoint do inversor) até a vibração voltar abaixo de 2,8 mm/s.' },
  { id: 'l2', padrao: 'sobrecarga', ordem: 2, titulo: 'Verificar alinhamento e rolamentos', descricao: 'Se a vibração persistir com carga normal.' },
  { id: 'l3', padrao: 'sobrecarga', ordem: 3, titulo: 'Parar o motor', descricao: 'Se a corrente ultrapassar 125 % de In por mais de 30 s.' },
  { id: 'l4', padrao: 'rolamento', ordem: 1, titulo: 'Inspecionar rolamentos e lubrificação', descricao: 'Vibração elevada com corrente estável indica causa mecânica.' },
  { id: 'l5', padrao: 'ventilacao', ordem: 1, titulo: 'Limpar a ventoinha e as aletas da carcaça', descricao: 'Temperatura subindo com corrente e vibração normais.' },
  { id: 'l6', padrao: 'sensor', ordem: 1, titulo: 'Verificar a fixação e o cabo do sensor', descricao: 'Pico isolado em uma grandeza sem correlação nas demais.' },
]

interface EstadoLocal {
  motor: Motor | null
  regras: Regra[]
  coletor: { hash: string; cfg: ConfigColetorGuia } | null
  leituras: Leitura[]
  alertas: Alerta[]
  proximoId: number
  ouvintesLeituras: Set<(ls: Leitura[]) => void>
  ouvintesAlertas: Set<(as: Alerta[]) => void>
}

const estado: EstadoLocal = {
  motor: null,
  regras: [],
  coletor: null,
  leituras: [],
  alertas: [],
  proximoId: 1,
  ouvintesLeituras: new Set(),
  ouvintesAlertas: new Set(),
}

const uuidLocal = () => 'local-' + Math.random().toString(36).slice(2, 10)

function regrasPadrao(motor: Motor): Regra[] {
  const inA = motor.corrente_nominal_a ?? 10
  const v = motor.tensao_nominal_v ?? 220
  const rpm = motor.rpm_nominal ?? 1740
  const r = (grandeza: Grandeza, a: number, c: number): Regra => ({ id: uuidLocal(), motor_id: motor.id, grandeza, limite_atencao: +a.toFixed(2), limite_critico: +c.toFixed(2), origem: 'padrao', persistencia: 3 })
  return [r('vib', 2.8, 4.5), r('temp', 70, 85), r('corr', inA * 1.05, inA * 1.15), r('tens', v * 1.05, v * 1.1), r('rot', rpm * 1.03, rpm * 1.06)]
}

/** fase 1 em memória: N leituras válidas seguidas acima do limite crítico abrem o alerta (vib, corr, temp, nessa ordem) */
function avaliarFase1Local() {
  if (!estado.motor || estado.alertas.some((a) => a.status === 'ativo')) return
  for (const g of ['vib', 'corr', 'temp'] as const) {
    const r = estado.regras.find((x) => x.grandeza === g)
    if (!r) continue
    const n = r.persistencia ?? 3
    const ult = estado.leituras.slice(-n)
    if (ult.length < n) continue
    if (ult.every((l) => l[g] != null && (l[g] as number) >= r.limite_critico)) {
      estado.alertas.unshift({
        id: uuidLocal(),
        anomalia_id: null,
        motor_id: estado.motor.id,
        severidade: 'critico',
        titulo: g + ' acima do limite crítico',
        mensagem: `Fase 1 (limites fixos): ${n} leituras seguidas ≥ ${r.limite_critico}. Verifique a ação corretiva sugerida.`,
        status: 'ativo',
        reconhecido_por: null,
        reconhecido_em: null,
        acao_registrada: null,
        criado_em: new Date().toISOString(),
      })
      estado.ouvintesAlertas.forEach((f) => f([...estado.alertas]))
      return
    }
  }
}

export const backendLocal: GuiaBackend = {
  local: true,

  async criarMotor(_conta, d) {
    const motor: Motor = { ...d, id: uuidLocal(), conta_id: 'local', simulado: true, criado_em: new Date().toISOString() }
    estado.motor = motor
    estado.regras = regrasPadrao(motor)
    estado.coletor = null
    estado.leituras = []
    estado.alertas = []
    return motor
  },

  async carregarMotor(id) {
    return estado.motor?.id === id ? estado.motor : null
  },

  async regras() {
    return estado.regras
  },

  async salvarColetor(_m, cfg, chave) {
    estado.coletor = { hash: await sha256Hex(chave), cfg }
  },

  async atualizarSensores(_m, cfg) {
    if (estado.coletor) estado.coletor.cfg = cfg
  },

  async rotacionarChave(_m, chave) {
    if (estado.coletor) estado.coletor.hash = await sha256Hex(chave)
  },

  async enviar(chave, payload) {
    if (!estado.motor || !estado.coletor) throw new Error('coletor não configurado')
    if ((await sha256Hex(chave)) !== estado.coletor.hash) throw new Error('token inválido')
    const p = payload as Record<string, number | undefined>
    const l: Leitura = {
      id: estado.proximoId++,
      motor_id: estado.motor.id,
      ts: new Date().toISOString(),
      temp: p.temp ?? null,
      corr: p.corr ?? null,
      vib: p.vib ?? null,
      tens: p.tens ?? null,
      rot: p.rot ?? null,
      simulado: true,
      valida: true,
    }
    estado.leituras = [...estado.leituras, l].slice(-300)
    estado.ouvintesLeituras.forEach((f) => f(estado.leituras))
    avaliarFase1Local()
    return l.id
  },

  assinarLeituras(_m, n, cb) {
    const f = (ls: Leitura[]) => cb(ls.slice(-n))
    estado.ouvintesLeituras.add(f)
    f(estado.leituras)
    return () => {
      estado.ouvintesLeituras.delete(f)
    }
  },

  assinarAlertas(_m, cb) {
    estado.ouvintesAlertas.add(cb)
    cb([...estado.alertas])
    return () => {
      estado.ouvintesAlertas.delete(cb)
    }
  },

  async reconhecer(alertaId, uid, acao) {
    estado.alertas = estado.alertas.map((a) =>
      a.id === alertaId ? { ...a, status: 'reconhecido', reconhecido_por: uid ?? null, reconhecido_em: new Date().toISOString(), acao_registrada: acao || null } : a,
    )
    estado.ouvintesAlertas.forEach((f) => f([...estado.alertas]))
  },

  async acoes() {
    return ACOES_LOCAIS
  },

  async status(motorId) {
    if (!estado.motor || estado.motor.id !== motorId) return null
    return {
      motor_id: motorId,
      inicio: estado.leituras[0]?.ts ?? null,
      dias: 0,
      n_leituras: estado.leituras.length,
      fase: 1,
      aviso_multispeed: estado.motor.aplicacao === 'multispeed' && !estado.coletor?.cfg.sensores.rot,
    }
  },

  async removerMotor() {
    estado.motor = null
    estado.regras = []
    estado.coletor = null
    estado.leituras = []
    estado.alertas = []
  },
}
