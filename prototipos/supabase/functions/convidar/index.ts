// Eixo · Edge Function "convidar"
// Envia o e-mail de convite para um convite pendente (tabela convites, migração 002).
//
// Chamada pelo app logo depois de o master inserir o convite (e pelo botão "Reenviar"):
//   POST /functions/v1/convidar   { "convite_id": "<uuid>", "origem": "https://eixomotores.cloud" }
//   Authorization: Bearer <JWT do master>
//
// - e-mail sem conta na Eixo → auth.admin.inviteUserByEmail (template "Invite user"): a pessoa
//   clica, define nome e senha e entra direto na empresa (vincular_convite, migração 004);
// - e-mail que já tem conta sem empresa → link de acesso (template "Magic Link"): ao entrar,
//   o convite é aceito;
// - e-mail que já pertence a outra empresa → 409 e o convite é removido.
//
// Implantar sem "Verify JWT" (a função valida o JWT do chamador com auth.getUser).
// Variáveis: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem nas Edge Functions;
// SITE_URL é opcional (padrão https://eixomotores.cloud).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const SITE = Deno.env.get('SITE_URL') ?? 'https://eixomotores.cloud'
const PAPEL: Record<string, string> = { admin: 'Admin', comum: 'Comum' }

/** service_role (chaves legadas) ou a chave secreta nova (SUPABASE_SECRET_KEYS = {"default": "sb_secret_…"}) */
function chaveSecreta(): string {
  const legada = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legada) return legada
  try {
    const novas = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    return novas.default ?? Object.values(novas)[0] ?? ''
  } catch {
    return ''
  }
}

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function traduzir(msg: string) {
  const m = msg.toLowerCase()
  if (m.includes('rate limit')) return 'Limite de envio de e-mails atingido. Tente de novo em alguns minutos.'
  if (m.includes('not authorized') || m.includes('not allowed')) return 'O servidor de e-mail recusou o destinatário (SMTP padrão do Supabase só envia para a equipe do projeto).'
  return msg
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta(405, { erro: 'Use POST.' })

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return resposta(401, { erro: 'Entre na plataforma para convidar.' })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, chaveSecreta(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: u, error: eu } = await admin.auth.getUser(jwt)
  if (eu || !u.user) return resposta(401, { erro: 'Sessão inválida. Entre de novo.' })

  let corpo: { convite_id?: string; origem?: string }
  try {
    corpo = await req.json()
  } catch {
    return resposta(400, { erro: 'Corpo JSON inválido.' })
  }

  const { data: quem } = await admin.from('perfis').select('id, nome, email, papel, conta_id, ativo').eq('id', u.user.id).maybeSingle()
  if (!quem || !quem.ativo || quem.papel !== 'master' || !quem.conta_id) {
    return resposta(403, { erro: 'Só o master da empresa envia convites.' })
  }

  const { data: conv } = await admin
    .from('convites')
    .select('id, email, papel, conta_id, aceito_em')
    .eq('id', String(corpo.convite_id ?? ''))
    .maybeSingle()
  if (!conv || conv.conta_id !== quem.conta_id) return resposta(404, { erro: 'Convite não encontrado.' })
  if (conv.aceito_em) return resposta(409, { erro: 'Este convite já foi aceito.' })

  const email = String(conv.email).toLowerCase()
  const { data: existente } = await admin.from('perfis').select('id, conta_id, papel').eq('email', email).maybeSingle()
  if (existente?.conta_id === quem.conta_id) {
    await admin.from('convites').delete().eq('id', conv.id)
    return resposta(409, { erro: `${email} já é usuário desta empresa.`, convite_removido: true })
  }
  if (existente && (existente.conta_id || existente.papel === 'dev')) {
    await admin.from('convites').delete().eq('id', conv.id)
    return resposta(409, {
      erro: `${email} já usa a Eixo em outra empresa. Cada e-mail pertence a uma só empresa: peça outro e-mail para o convite.`,
      convite_removido: true,
    })
  }

  const { data: conta } = await admin.from('contas').select('nome').eq('id', conv.conta_id).single()
  const origem = typeof corpo.origem === 'string' && /^https?:\/\//.test(corpo.origem) ? corpo.origem : SITE

  // 1) sem conta confirmada: convite (também reenvia para quem foi convidado e ainda não entrou)
  const { error: ei } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: origem,
    data: { empresa: conta?.nome ?? '', papel: PAPEL[conv.papel] ?? conv.papel, convidado_por: quem.nome || quem.email },
  })
  if (!ei) return resposta(200, { enviado: 'convite' })
  if (!/already|registered|exists/i.test(ei.message)) return resposta(502, { erro: traduzir(ei.message) })

  // 2) já tem conta (sem empresa): link de acesso; ao entrar, vincular_convite aceita o convite
  const { error: eo } = await admin.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: origem } })
  if (eo) return resposta(502, { erro: traduzir(eo.message) })
  return resposta(200, { enviado: 'link' })
})
