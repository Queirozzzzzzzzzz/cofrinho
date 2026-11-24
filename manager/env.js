import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')

// Parser simples de .env (sem dependências). Variáveis de ambiente reais têm prioridade.
const arquivo = {}
try {
  for (const linha of fs.readFileSync(FILE, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linha)
    if (m) arquivo[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {}

const bruto = nome => process.env[nome] ?? arquivo[nome]

function num(nome, padrao) {
  const b = bruto(nome)
  if (b === undefined || b === '') return padrao
  const n = Number(String(b).replace(',', '.'))
  if (!Number.isFinite(n)) {
    console.error('.env: valor inválido em ' + nome + ' ("' + b + '"), usando ' + padrao)
    return padrao
  }
  return n
}

function txt(nome, padrao) {
  const b = bruto(nome)
  return b === undefined || b === '' ? padrao : b
}

const offset = num('FUSO_OFFSET_HORAS', -3)
const abs = Math.abs(offset)
const offsetStr = (offset < 0 ? '-' : '+') +
  String(Math.trunc(abs)).padStart(2, '0') + ':' +
  String(Math.round((abs % 1) * 60)).padStart(2, '0')

export const ENV = {
  SELIC_ANUAL: num('SELIC_ANUAL', 13.75),
  CDI_SPREAD: num('CDI_SPREAD', 0.10),
  PERCENTUAL_CDI: num('PERCENTUAL_CDI', 100),
  RELATORIO_DIA: num('RELATORIO_DIA', 0),
  RELATORIO_HORA: num('RELATORIO_HORA', 8),
  RELATORIO_LIMITE_HORA: num('RELATORIO_LIMITE_HORA', 12),
  INTERVALO_ENVIO_MS: num('INTERVALO_ENVIO_MS', 3000),
  EXTRATO_PADRAO: num('EXTRATO_PADRAO', 10),
  EXTRATO_MAXIMO: num('EXTRATO_MAXIMO', 50),
  FUSO: txt('FUSO', 'America/Sao_Paulo'),
  FUSO_OFFSET_HORAS: offset,
  FUSO_OFFSET_STR: offsetStr,
}
