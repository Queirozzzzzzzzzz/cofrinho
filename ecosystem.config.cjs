module.exports = {
  apps: [{
    name: 'bot',
    script: 'whatsapp-bot/index.js',
    cwd: __dirname,
    watch: ['whatsapp-bot', 'manager', '.env'],
    // auth e data mudam o tempo todo: sem ignorar, o bot reiniciaria em loop
    ignore_watch: ['whatsapp-bot/auth', 'data', 'node_modules', '.git'],
    watch_delay: 1500,
    autorestart: true,
  }],
}
