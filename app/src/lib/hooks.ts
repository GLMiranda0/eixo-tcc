import { useCallback, useEffect, useRef, useState } from 'react'
import { useContaAtiva } from './auth'
import { supabase } from './supabase'
import type { Alerta, Coletor, Leitura, Motor, Regra, StatusAprendizado } from './types'

/** id único por instância, para não reaproveitar o mesmo canal Realtime entre componentes */
function useCanal(prefixo: string) {
  const r = useRef(prefixo + '-' + Math.random().toString(36).slice(2, 8))
  return r.current
}

/**
 * IDs dos motores visíveis para o filtro atual.
 * null = sem filtro extra (usuário normal: o RLS já isola a empresa).
 * [] = nada a mostrar (dev sem empresa selecionada ou empresa sem motores).
 */
export function useIdsMotoresFiltro() {
  const { contaId, isDev, semEmpresa } = useContaAtiva()
  const [ids, setIds] = useState<string[] | null>(isDev ? [] : null)
  useEffect(() => {
    if (!isDev) return setIds(null)
    if (semEmpresa || !contaId) return setIds([])
    let vivo = true
    supabase
      .from('motores')
      .select('id')
      .eq('conta_id', contaId)
      .then(({ data }) => vivo && setIds(((data as { id: string }[]) ?? []).map((m) => m.id)))
    return () => {
      vivo = false
    }
  }, [contaId, isDev, semEmpresa])
  return ids
}

export function useMotores() {
  const { contaId, pronto, semEmpresa } = useContaAtiva()
  const [motores, setMotores] = useState<Motor[]>([])
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    if (!pronto) return
    if (semEmpresa) {
      setMotores([])
      setCarregando(false)
      return
    }
    let q = supabase.from('motores').select('*').order('tag')
    if (contaId) q = q.eq('conta_id', contaId)
    const { data } = await q
    setMotores((data as Motor[]) ?? [])
    setCarregando(false)
  }, [contaId, pronto, semEmpresa])
  useEffect(() => {
    recarregar()
  }, [recarregar])
  return { motores, carregando, recarregar }
}

export function useMotor(id: string | undefined) {
  const [motor, setMotor] = useState<Motor | null>(null)
  const [coletor, setColetor] = useState<Coletor | null>(null)
  const [regras, setRegras] = useState<Regra[]>([])
  const [status, setStatus] = useState<StatusAprendizado | null>(null)
  const recarregar = useCallback(async () => {
    if (!id) return
    const [m, c, r, s] = await Promise.all([
      supabase.from('motores').select('*').eq('id', id).maybeSingle(),
      supabase.from('coletores').select('*').eq('motor_id', id).maybeSingle(),
      supabase.from('regras_diagnostico').select('*').eq('motor_id', id),
      supabase.from('status_aprendizado').select('*').eq('motor_id', id).maybeSingle(),
    ])
    setMotor(m.data as Motor | null)
    setColetor(c.data as Coletor | null)
    setRegras((r.data as Regra[]) ?? [])
    setStatus(s.data as StatusAprendizado | null)
  }, [id])
  useEffect(() => {
    recarregar()
  }, [recarregar])
  return { motor, coletor, regras, status, recarregar }
}

/** Últimas N leituras válidas de um motor, atualizadas em tempo real. */
export function useLeituras(motorId: string | undefined, n = 60) {
  const [leituras, setLeituras] = useState<Leitura[]>([])
  useEffect(() => {
    if (!motorId) return
    let vivo = true
    supabase
      .from('leituras')
      .select('*')
      .eq('motor_id', motorId)
      .eq('valida', true)
      .order('ts', { ascending: false })
      .limit(n)
      .then(({ data }) => vivo && setLeituras(((data as Leitura[]) ?? []).reverse()))
    const ch = supabase
      .channel('leituras-' + motorId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leituras', filter: `motor_id=eq.${motorId}` }, (p) => {
        const l = p.new as Leitura
        if (!l.valida) return
        setLeituras((prev) => [...prev, l].slice(-n))
      })
      .subscribe()
    return () => {
      vivo = false
      supabase.removeChannel(ch)
    }
  }, [motorId, n])
  return leituras
}

/** Última leitura de cada motor da conta (tabela da visão geral). */
export function useUltimasLeituras(motorIds: string[]) {
  const [mapa, setMapa] = useState<Record<string, Leitura>>({})
  const chave = motorIds.join(',')
  useEffect(() => {
    if (!motorIds.length) return
    Promise.all(
      motorIds.map((id) =>
        supabase.from('leituras').select('*').eq('motor_id', id).eq('valida', true).order('ts', { ascending: false }).limit(1).maybeSingle(),
      ),
    ).then((rs) => {
      const m: Record<string, Leitura> = {}
      rs.forEach((r) => {
        if (r.data) m[(r.data as Leitura).motor_id] = r.data as Leitura
      })
      setMapa(m)
    })
    const ch = supabase
      .channel('leituras-todas')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leituras' }, (p) => {
        const l = p.new as Leitura
        if (l.valida) setMapa((prev) => ({ ...prev, [l.motor_id]: l }))
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return mapa
}

export function useAlertas(somenteAtivos: boolean) {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const ids = useIdsMotoresFiltro()
  const chaveIds = ids ? ids.join(',') : '*'
  const canal = useCanal('alertas-lista')
  const recarregar = useCallback(async () => {
    if (ids && !ids.length) {
      setAlertas([])
      return
    }
    let q = supabase.from('alertas').select('*').order('criado_em', { ascending: false }).limit(100)
    if (somenteAtivos) q = q.eq('status', 'ativo')
    if (ids) q = q.in('motor_id', ids)
    const { data } = await q
    setAlertas((data as Alerta[]) ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [somenteAtivos, chaveIds])
  useEffect(() => {
    recarregar()
    const ch = supabase
      .channel(canal)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, recarregar)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [recarregar, canal])
  return { alertas, recarregar }
}
