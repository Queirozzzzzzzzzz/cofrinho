import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { lerConfig, gravarConfig, parseValor } from './config.js'
import { relatorio } from './report.js'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'data.json')

const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = iso => new Date(iso).toLocaleString('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
})

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return {} }
}

function save(data) {
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, FILE)
}

// Cria !reserva / !investir: sem argumento mostra, com valor define, com +/- ajusta.
function comandoValor(nome, campo, emoji, titulo, descricao) {
  return {
    nome,
    uso: '!' + nome + ' [valor]',
    descricao,
    run({ args, number }) {
      const cfg = lerConfig()
      const u = cfg[number] || (cfg[number] = {})
      const atual = u[campo] || 0
      if (!args) return emoji + ' ' + titulo + ': ' + brl(atual)
      const m = /^([+-])?\s*(\d+(?:[.,]\d+)*)$/.exec(args)
      if (!m) return 'Use: !' + nome + ' valor (define), !' + nome + ' +valor (soma) ou !' + nome + ' -valor (subtrai)'
      const v = parseValor(m[2])
      const novo = m[1] === '+' ? atual + v : m[1] === '-' ? atual - v : v
      if (!Number.isFinite(novo) || novo < 0) return 'O valor não pode ficar negativo (atual: ' + brl(atual) + ').'
      u[campo] = Math.round(novo * 100) / 100
      gravarConfig(cfg)
      return emoji + ' ' + titulo + ' atualizado: ' + brl(u[campo])
    },
  }
}

// Para criar um comando novo, adicione um objeto neste array.
// Ele entra sozinho no !ajuda (usa "uso" e "descricao").
// run recebe { args, all, list } e retorna o texto da resposta.
export const comandos = [
  {
    nome: 'saldo',
    uso: '!saldo',
    descricao: 'Mostra o saldo, o total de entradas e o de saídas',
    run({ list }) {
      const ativos = list.filter(x => !x.disabled)
      if (!ativos.length) return 'Nenhum registro ainda.'
      const sum = t => ativos.filter(x => x.type === t).reduce((a, x) => a + x.value, 0)
      const entradas = sum('entrada')
      const saidas = sum('saida')
      return '💰 Saldo: ' + brl(entradas - saidas) +
        '\n⬆️ Entradas: ' + brl(entradas) +
        '\n⬇️ Saídas: ' + brl(saidas)
    },
  },
  {
    nome: 'extrato',
    uso: '!extrato [N]',
    descricao: 'Mostra os últimos N registros (padrão 10, máximo 50)',
    run({ args, list }) {
      const ativos = list.filter(x => !x.disabled)
      if (!ativos.length) return 'Nenhum registro ainda.'
      const n = Math.min(Math.max(Number(args) || 10, 1), 50)
      const linhas = ativos.slice(-n).map(x =>
        '#' + x.id + ' ' + (x.type === 'entrada' ? '➕ ' : '➖ ') + brl(x.value) + ' | ' + fmtDate(x.date) +
        (x.description ? '\n    ' + x.description : ''))
      return '📋 Últimos ' + linhas.length + ':\n\n' + linhas.join('\n')
    },
  },
  {
    nome: 'remover',
    uso: '!remover ID',
    descricao: 'Desabilita um registro pelo ID (ele continua salvo)',
    run({ args, all, list }) {
      if (!/^\d+$/.test(args)) return 'Use: !remover ID'
      const id = Number(args)
      const r = list.find(x => x.id === id)
      if (!r) return 'ID ' + id + ' não encontrado.'
      if (r.disabled) return 'ID ' + id + ' já está desabilitado.'
      r.disabled = true
      r.disabledAt = new Date().toISOString()
      save(all)
      return '🗑️ Desabilitado #' + id + ': ' + brl(r.value) + (r.description ? ' (' + r.description + ')' : '')
    },
  },
  comandoValor('reserva', 'reserva', '🛟', 'Reserva',
    'Mostra ou define o dinheiro na reserva (!reserva 500 | !reserva +100 | !reserva -50)'),
  comandoValor('investir', 'investido', '📈', 'Investido',
    'Mostra ou define o dinheiro preso em investimento (!investir 1000 | +100 | -50)'),
  {
    nome: 'relatorio',
    uso: '!relatorio',
    descricao: 'Envia agora o relatório semanal (também enviado todo domingo às 8h)',
    run({ number }) { return relatorio(number) },
  },
  {
    nome: 'ajuda',
    aliases: ['help'],
    uso: '!ajuda',
    descricao: 'Mostra esta lista de comandos',
    run() {
      const linhas = comandos.map(c => {
        const nomes = [c.uso, ...(c.aliases || []).map(a => '!' + a)].join('  •  ')
        return '▫️ *' + nomes + '*\n      _' + c.descricao + '_'
      })
      const mono = t => '\u0060\u0060\u0060' + t + '\u0060\u0060\u0060'
      const linha = '━━━━━━━━━━━━━━━'
      return '📖 *AJUDA · COFRINHO*\n' + linha + '\n\n' +
        '⚙️ *Comandos*\n\n' + linhas.join('\n\n') + '\n\n' + linha + '\n' +
        '✍️ *Registrar*\n\n' +
        '➕ Entrada: ' + mono('+valor descrição') + '\n' +
        '➖ Saída: ' + mono('-valor descrição') + '\n' +
        '📅 Data opcional no fim: ' + mono('DDMMAAAA') + '\n\n' +
        '💡 Ex: ' + mono('+1.500,50 salário 22112026')
    },
  },
]

// Retorna texto de resposta, ou null se não for um comando.
export function comando(m, text) {
  const match = /^!(\S+)(?:\s+([\s\S]*))?$/.exec((text || '').trim())
  if (!match) return null

  const nome = match[1].toLowerCase()
  const cmd = comandos.find(c => c.nome === nome || (c.aliases || []).includes(nome))
  if (!cmd) return null

  const jid = m.key.participant || m.key.remoteJid
  const number = jid.split('@')[0].split(':')[0]
  const all = load()
  const list = all[number] || []
  return cmd.run({ args: (match[2] || '').trim(), all, list, number })
}
