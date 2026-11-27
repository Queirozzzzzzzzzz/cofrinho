import { lerJson, lerConfig, gravarJson } from './config.js'
import { ENV } from './env.js'

// Valores vêm do .env (SELIC_ANUAL, CDI_SPREAD, PERCENTUAL_CDI)
const CDI_ANUAL = (ENV.SELIC_ANUAL - ENV.CDI_SPREAD) / 100
const PERCENTUAL_CDI = ENV.PERCENTUAL_CDI / 100

const DIA = 86400e3
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Brasília sem horário de verão (UTC-3): use os getters UTC do resultado
const local = t => new Date(t + ENV.FUSO_OFFSET_HORAS * 3600e3)

function periodo(list, ini, fim) {
  const r = { ent: 0, sai: 0, vEnt: 0, vSai: 0 }
  for (const x of list) {
    if (x.disabled) continue
    const t = local(new Date(x.date).getTime()).getTime()
    if (t < ini || t >= fim) continue
    if (x.type === 'entrada') { r.ent++; r.vEnt += x.value } else { r.sai++; r.vSai += x.value }
  }
  return r
}

const blocoPeriodo = p =>
  '➕ Entradas: ' + p.ent + ' (' + brl(p.vEnt) + ')\n' +
  '➖ Saídas: ' + p.sai + ' (' + brl(p.vSai) + ')\n' +
  '⚖️ Resultado: ' + brl(p.vEnt - p.vSai)

// IR regressivo da renda fixa
const aliquotaIR = dias => dias <= 180 ? 0.225 : dias <= 360 ? 0.20 : dias <= 720 ? 0.175 : 0.15

function rendimento(valor, dias) {
  const taxa = CDI_ANUAL * PERCENTUAL_CDI
  const bruto = valor * (Math.pow(1 + taxa, dias / 365) - 1)
  return bruto * (1 - aliquotaIR(dias))
}

export function relatorio(number) {
  const list = lerJson('data.json')[number] || []
  const cfg = lerConfig()[number] || {}
  const reserva = cfg.reserva || 0
  const investido = cfg.investido || 0
  const total = reserva + investido

  const agora = local(Date.now())
  const y = agora.getUTCFullYear()
  const m = agora.getUTCMonth()
  const hoje0 = Date.UTC(y, m, agora.getUTCDate())
  const iniSemana = hoje0 - ((agora.getUTCDay() + 6) % 7) * DIA // segunda-feira
  const semana = periodo(list, iniSemana, iniSemana + 7 * DIA)
  const mes = periodo(list, Date.UTC(y, m, 1), Date.UTC(y, m + 1, 1))
  const nomeMes = agora.toLocaleString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  let proj
  if (total <= 0) {
    proj = '🔮 _Informe quanto você guarda com_ !reserva _e_ !investir _para ver a previsão de rendimento._'
  } else {
    const taxa = (CDI_ANUAL * PERCENTUAL_CDI * 100).toFixed(2).replace('.', ',')
    const linhas = [[30, '1 mês'], [180, '6 meses'], [365, '1 ano']].map(([dias, nome]) => {
      const r = rendimento(total, dias)
      return '• ' + nome + ': +' + brl(r) + ' → ' + brl(total + r)
    })
    proj = '🔮 *Se não gastar, em renda fixa*\n_≈ ' + taxa + '% a.a., líquido de IR_\n\n' + linhas.join('\n') +
      '\n\n⚠️ _Estimativa simples (CDI constante, IR regressivo). Não é garantia de rendimento._'
  }

  const linha = '━━━━━━━━━━━━━━━'
  return '📊 *RELATÓRIO SEMANAL · COFRINHO*\n' + linha + '\n\n' +
    '📅 *Semana* _(segunda a domingo)_\n' + blocoPeriodo(semana) + '\n\n' +
    '🗓️ *Mês* _(' + nomeMes + ')_\n' + blocoPeriodo(mes) + '\n\n' + linha + '\n' +
    '💰 *Guardado*\n\n' +
    '🛟 Reserva: ' + brl(reserva) + '\n' +
    '📈 Investido: ' + brl(investido) + '\n' +
    '🏦 *Total: ' + brl(total) + '*\n\n' + linha + '\n' + proj
}

// ---- Agendador: todo domingo às 8h (Brasília) ----
let sockAtual = null
let timer = null
let ocupado = false

async function verificar() {
  if (!sockAtual || ocupado) return
  const l = local(Date.now())
  // Dia e hora vêm do .env. Se o bot estava fora do ar, ainda envia até RELATORIO_LIMITE_HORA.
  if (l.getUTCDay() !== ENV.RELATORIO_DIA || l.getUTCHours() < ENV.RELATORIO_HORA || l.getUTCHours() >= ENV.RELATORIO_LIMITE_HORA) return
  const hoje = l.toISOString().slice(0, 10)
  const estado = lerJson('estado.json')
  if (estado.ultimoRelatorio === hoje) return

  ocupado = true
  try {
    const cfgAtual = lerConfig()
    const numeros = Object.keys(cfgAtual).filter(n => cfgAtual[n].ativo)
    for (const n of numeros) {
      try {
        await sockAtual.sendMessage(n + '@s.whatsapp.net', { text: relatorio(n) })
        console.log('Relatório enviado para ' + n)
      } catch (e) {
        console.error('Falha ao enviar relatório para ' + n + ': ' + e.message)
      }
      await new Promise(r => setTimeout(r, ENV.INTERVALO_ENVIO_MS))
    }
    estado.ultimoRelatorio = hoje
    gravarJson('estado.json', estado)
  } finally {
    ocupado = false
  }
}

// Pode ser chamado a cada reconexão: mantém um único agendador e usa o socket mais recente.
export function iniciarRelatorio(sock) {
  sockAtual = sock
  if (!timer) {
    timer = setInterval(verificar, 30000)
    console.log('Agendador do relatório ativo (dia ' + ENV.RELATORIO_DIA + ', ' + ENV.RELATORIO_HORA + 'h)')
  }
}
