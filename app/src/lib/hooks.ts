import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Alerta, Coletor, Leitura, Motor, Regra, StatusAprendizado } from './types'

export function useMotores() {
  const [motores, setMotores] = useState<Motor[]>([])
  const [carregando, setCarregando] = useState(true)
  const recarregar = useCallback(async () => {
    const { data } = await supabase.from('motores').select('*').order('tag')
    setMotores((data as Motor[]) ?? [])
    setCarregando(false)
  }, [])
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
  const recarregar = useCallback(async () => {
    let q = supabase.from('alertas').select('*').order('criado_em', { ascending: false }).limit(100)
    if (somenteAtivos) q = q.eq('status', 'ativo')
    const { data } = await q
    setAlertas((data as Alerta[]) ?? [])
  }, [somenteAtivos])
  useEffect(() => {
    recarregar()
    const ch = supabase
      .channel('alertas-lista')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas' }, recarregar)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [recarregar])
  return { alertas, recarregar }
}
