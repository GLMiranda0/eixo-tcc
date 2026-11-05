export type Grandeza = 'temp' | 'corr' | 'vib' | 'tens' | 'rot'

export interface Motor {
  id: string
  conta_id: string
  tag: string
  nome: string
  fabricante: string | null
  modelo: string | null
  potencia_cv: number | null
  tensao_nominal_v: number | null
  corrente_nominal_a: number | null
  rpm_nominal: number | null
  aplicacao: 'fixa' | 'multispeed'
  simulado: boolean
  criado_em: string
}

export interface Coletor {
  id: string
  motor_id: string
  tipo: 'eixo' | 'terceiro'
  protocolo: 'post' | 'mqtt'
  token_hash: string
  mede_temp: boolean
  mede_corr: boolean
  mede_vib: boolean
  mede_tens: boolean
  mede_rot: boolean
  ultimo_contato: string | null
}

export interface Leitura {
  id: number
  motor_id: string
  ts: string
  temp: number | null
  corr: number | null
  vib: number | null
  tens: number | null
  rot: number | null
  simulado: boolean
  valida: boolean
}

export interface Regra {
  id: string
  motor_id: string
  grandeza: Grandeza
  limite_atencao: number
  limite_critico: number
  origem: 'padrao' | 'usuario'
}

export interface Alerta {
  id: string
  anomalia_id: string | null
  motor_id: string
  severidade: 'atencao' | 'critico'
  titulo: string
  mensagem: string | null
  status: 'ativo' | 'reconhecido' | 'resolvido' | 'silenciado'
  reconhecido_por: string | null
  reconhecido_em: string | null
  acao_registrada: string | null
  criado_em: string
}

export interface AcaoCorretiva {
  id: string
  padrao: string
  ordem: number
  titulo: string
  descricao: string
}

export interface StatusAprendizado {
  motor_id: string
  inicio: string | null
  dias: number
  n_leituras: number
  fase: 1 | 2 | 3
  aviso_multispeed: boolean
}

export type Papel = 'dev' | 'master' | 'admin' | 'comum'

export interface Perfil {
  id: string
  conta_id: string | null
  nome: string | null
  papel: Papel
  ativo: boolean
  email: string | null
  criado_por: string | null
  criado_em: string
}

export interface Conta {
  id: string
  nome: string
  cnpj: string | null
  ativa: boolean
  criado_em: string
}

export interface Convite {
  id: string
  conta_id: string
  email: string
  papel: 'admin' | 'comum'
  criado_por: string | null
  criado_em: string
  aceito_em: string | null
  aceito_por: string | null
}

export interface Auditoria {
  id: number
  ts: string
  usuario_id: string | null
  usuario_email: string | null
  conta_id: string | null
  tabela: string
  operacao: 'INSERT' | 'UPDATE' | 'DELETE'
  registro_id: string | null
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
}

export interface VisaoDev {
  conta_id: string
  nome: string
  cnpj: string | null
  ativa: boolean
  criado_em: string
  usuarios: number
  masters: number
  admins: number
  comuns: number
  motores: number
  coletores: number
  alertas_ativos: number
  ultimo_contato: string | null
}

export const PAPEL_LABEL: Record<Papel, string> = { dev: 'Dev', master: 'Master', admin: 'Admin', comum: 'Comum' }

export const LIMITES_PAPEL: Record<'master' | 'admin' | 'comum', number> = { master: 1, admin: 4, comum: 5 }

export const GRANDEZAS: Record<Grandeza, { nome: string; unidade: string; cor: string; min: number; max: number; casas: number }> = {
  temp: { nome: 'Temperatura', unidade: '°C', cor: 'var(--s-temp)', min: 20, max: 100, casas: 0 },
  corr: { nome: 'Corrente', unidade: 'A', cor: 'var(--s-corr)', min: 0, max: 15, casas: 1 },
  vib: { nome: 'Vibração', unidade: 'mm/s', cor: 'var(--s-vib)', min: 0, max: 8, casas: 1 },
  rot: { nome: 'Rotação', unidade: 'rpm', cor: 'var(--s-rot)', min: 0, max: 2000, casas: 0 },
  tens: { nome: 'Tensão', unidade: 'V', cor: 'var(--s-tens)', min: 180, max: 260, casas: 0 },
}

export const fmt = (g: Grandeza, v: number | null | undefined) =>
  v == null ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: GRANDEZAS[g].casas, maximumFractionDigits: GRANDEZAS[g].casas })

export type Sev = 'ok' | 'warn' | 'crit'

export function severidade(regras: Regra[], g: Grandeza, v: number | null | undefined): Sev {
  if (v == null) return 'ok'
  const r = regras.find((x) => x.grandeza === g)
  if (!r) return 'ok'
  if (v >= r.limite_critico) return 'crit'
  if (v >= r.limite_atencao) return 'warn'
  return 'ok'
}

export function pior(regras: Regra[], l: Leitura | null, medidas: Grandeza[]): Sev {
  if (!l) return 'ok'
  const sevs = medidas.map((g) => severidade(regras, g, l[g]))
  if (sevs.includes('crit')) return 'crit'
  if (sevs.includes('warn')) return 'warn'
  return 'ok'
}

export const SEV_LABEL: Record<Sev, string> = { ok: 'Normal', warn: 'Atenção', crit: 'Crítico' }
