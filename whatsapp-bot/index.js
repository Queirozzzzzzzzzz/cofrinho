import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { registrar } from '../manager/finance.js'
import { comando } from '../manager/commands.js'
import { iniciarRelatorio } from '../manager/report.js'
import path from 'path'
import { fileURLToPath } from 'url'
const AUTH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'auth')

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH)
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === 'open') {
      console.log('Conectado')
      iniciarRelatorio(sock)
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code !== DisconnectReason.loggedOut) start()
      else console.log('Sessão encerrada. Apague a pasta auth e escaneie de novo.')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      if (m.key.fromMe) continue
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text
      if (text === '!ping') await sock.sendMessage(m.key.remoteJid, { text: 'pong' })
      const resp = registrar(m, text) ?? comando(m, text)
      if (resp) await sock.sendMessage(m.key.remoteJid, { text: resp })
    }
  })
}
start()
