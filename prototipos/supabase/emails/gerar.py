"""Gera os templates de e-mail do Supabase Auth com a identidade da Eixo.

    python gerar.py

Saída: um .html por template nesta pasta. Colar cada um em Supabase › Authentication ›
Emails › Templates (assunto em ASSUNTOS, abaixo). Os e-mails usam tabelas e estilos inline
(Gmail e Outlook ignoram <style> e SVG); o logo é o PNG publicado em https://eixomotores.cloud.
"""
from pathlib import Path

LOGO = "https://eixomotores.cloud/email-logo.png"
SITE = "https://eixomotores.cloud"

ASSUNTOS = {
    "confirmar-conta.html": "Confirme seu e-mail · Eixo",
    "convite.html": "Você foi convidado para a Eixo",
    "link-acesso.html": "Seu link de acesso · Eixo",
    "recuperar-senha.html": "Redefinir senha · Eixo",
}

FONTE = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def botao(href: str, texto: str) -> str:
    return f"""<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px">
              <tr><td style="border-radius:12px;background-color:#0891B2;background-image:linear-gradient(135deg,#0891B2,#2563EB)">
                <a href="{href}" style="display:inline-block;padding:14px 28px;font-family:{FONTE};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px">{texto} &rarr;</a>
              </td></tr>
            </table>"""


def layout(previa: str, sobretitulo: str, titulo: str, corpo: str, rodape: str) -> str:
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>{titulo}</title>
</head>
<body style="margin:0;padding:0;background:#F3F6F9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">{previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F6F9">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D7DFE8;border-radius:16px;overflow:hidden">
      <tr><td style="background:#0F1A28;padding:22px 32px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle"><img src="{LOGO}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px"></td>
          <td style="vertical-align:middle;padding-left:12px;font-family:{FONTE};font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#E7EEF5">eixo</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;background-color:#22D3EE;background-image:linear-gradient(90deg,#22D3EE,#2563EB);font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:32px 32px 8px;font-family:{FONTE};color:#0F1A28">
        <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:#0891B2">{sobretitulo}</p>
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:800;color:#0F1A28">{titulo}</h1>
        {corpo}
      </td></tr>
      <tr><td style="padding:8px 32px 28px;font-family:{FONTE};font-size:12px;line-height:1.6;color:#5A6B7E">
        <p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #EAF0F5">{rodape}</p>
      </td></tr>
    </table>
    <p style="margin:18px 0 0;font-family:{FONTE};font-size:11px;color:#8C9DB2">
      Eixo · Supervisão inteligente de motores elétricos · <a href="{SITE}" style="color:#5A6B7E">eixomotores.cloud</a>
    </p>
  </td></tr>
</table>
</body>
</html>
"""


def p(txt: str) -> str:
    return f'<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#33475B">{txt}</p>'


def link_reserva(href: str) -> str:
    return (
        '<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#5A6B7E">O botão não abriu? Copie e cole no navegador:<br>'
        f'<a href="{href}" style="color:#0891B2;word-break:break-all">{href}</a></p>'
    )


def passos(itens: list[str]) -> str:
    linhas = "".join(
        f"""<tr><td style="vertical-align:top;padding:0 10px 8px 0"><span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#DDF4FA;color:#0891B2;font-size:12px;font-weight:700;line-height:22px;text-align:center">{i}</span></td>
<td style="vertical-align:top;padding:2px 0 8px;font-size:14px;line-height:1.5;color:#33475B">{t}</td></tr>"""
        for i, t in enumerate(itens, 1)
    )
    return f'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;background:#F3F6F9;border-radius:12px;width:100%"><tr><td style="padding:14px 16px 6px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">{linhas}</table></td></tr></table>'


URL = "{{ .ConfirmationURL }}"

TEMPLATES = {
    "confirmar-conta.html": layout(
        "Falta um clique para ativar sua conta na Eixo.",
        "Bem-vindo à Eixo",
        "Confirme seu e-mail",
        p("Olá{{ if .Data.nome }}, {{ .Data.nome }}{{ end }}! Sua conta na Eixo foi criada com o e-mail <b>{{ .Email }}</b>. "
          "Confirme que o endereço é seu para ativar o acesso.")
        + botao(URL, "Confirmar e-mail")
        + '<p style="margin:18px 0 8px;font-size:13px;font-weight:700;color:#0F1A28">Depois de confirmar</p>'
        + passos([
            "Você volta para a plataforma já conectado.",
            "Se recebeu um convite, entra direto na empresa que te convidou.",
            "Se não, cadastra a sua empresa (nome fantasia, razão social e CNPJ) e convida sua equipe.",
        ])
        + link_reserva(URL),
        "Não criou uma conta na Eixo? Ignore este e-mail: sem a confirmação, a conta não é ativada.",
    ),
    "convite.html": layout(
        "Você foi convidado para acompanhar os motores da {{ .Data.empresa }} na Eixo.",
        "Convite",
        "Você foi convidado para a Eixo",
        p("<b>{{ .Data.convidado_por }}</b> convidou você para acompanhar os motores elétricos da empresa "
          "<b>{{ .Data.empresa }}</b> na Eixo, com o papel <b>{{ .Data.papel }}</b>.")
        + p('{{ if eq .Data.papel "Admin" }}Como Admin, você cadastra e edita motores e coletores e trata os alertas.'
            "{{ else }}Como Comum, você acompanha o monitoramento em tempo real e os alertas.{{ end }}")
        + botao(URL, "Aceitar convite")
        + passos([
            "Clique em <b>Aceitar convite</b>.",
            "Informe seu nome e crie uma senha.",
            "Pronto: você entra direto no painel da empresa.",
        ])
        + link_reserva(URL),
        "Não esperava este convite? Ignore este e-mail: nenhuma conta é ativada sem você definir a senha. "
        "Se o link tiver expirado, peça ao master da empresa um novo envio.",
    ),
    "link-acesso.html": layout(
        "Seu link para entrar na Eixo.",
        "Acesso",
        "Seu link de acesso",
        p("Use o botão abaixo para entrar na Eixo com <b>{{ .Email }}</b>, sem digitar a senha.")
        + p("Se você recebeu um convite de uma empresa, ao entrar você cai direto nela.")
        + botao(URL, "Entrar na Eixo")
        + link_reserva(URL),
        "O link funciona uma única vez e expira em pouco tempo. Não pediu este acesso? Ignore este e-mail.",
    ),
    "recuperar-senha.html": layout(
        "Redefina a senha da sua conta na Eixo.",
        "Recuperar senha",
        "Redefinir sua senha",
        p("Recebemos um pedido para redefinir a senha da conta <b>{{ .Email }}</b> na Eixo.")
        + botao(URL, "Definir nova senha")
        + '<p style="margin:18px 0 6px;font-size:13px;color:#5A6B7E">Ou digite este código na tela de recuperação:</p>'
        + '<p style="margin:0;font-family:Consolas,\'Courier New\',monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#0F1A28">{{ .Token }}</p>'
        + link_reserva(URL),
        "Não pediu a troca de senha? Ignore este e-mail: sua senha atual continua valendo.",
    ),
}

if __name__ == "__main__":
    pasta = Path(__file__).parent
    for nome, html in TEMPLATES.items():
        (pasta / nome).write_text(html, encoding="utf-8", newline="\n")
        print(f"{nome:24} assunto: {ASSUNTOS[nome]}")
