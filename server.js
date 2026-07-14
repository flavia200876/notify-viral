const express = require('express');
const webpush = require('web-push');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BBj54Sl7GyGwUPjG2VqVPVQ7l-0aT-UEdertIEfwk4uzQYyHJO2_F9izgvZyRcJL5gMCFzo8JV7zJevWZsRvPlY';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'nyDy9GLFasnsen82IA5V7_PDpzLp5dg0l1L3stU59u4';
const CHECK_CRON = process.env.CHECK_CRON || '*/5 * * * *'; // a cada 5 minutos
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

webpush.setVapidDetails('mailto:contato@notifyviral.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ---------- STORAGE (arquivos JSON simples) ----------
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
let sources = readJSON(SOURCES_FILE, []);
let subscriptions = readJSON(SUBS_FILE, []);

// ---------- TIKTOK CHECK LOGIC ----------
function normalizeTikTokUrl(url) {
  url = url.trim();
  if (!url.startsWith('http')) url = 'https://www.tiktok.com/@' + url.replace('@', '');
  return url.split('?')[0];
}

function extractLatestVideo(html) {
  const idMatches = [...html.matchAll(/\/video\/(\d{15,20})/g)].map(m => m[1]);
  if (idMatches.length === 0) return null;
  const latestId = idMatches[0];
  let desc = null;
  const descRegex = new RegExp(`"id":"${latestId}"[^}]*?"desc":"([^"]{0,120})`, 's');
  const m1 = html.match(descRegex);
  if (m1) desc = m1[1];
  return {
    id: latestId,
    desc: desc ? desc.replace(/\\u([\dA-Fa-f]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16))) : null
  };
}

async function fetchTikTokProfile(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

async function checkSource(src) {
  try {
    const html = await fetchTikTokProfile(src.url);
    const latest = extractLatestVideo(html);
    if (!latest) {
      src.error = 'Não consegui ler o perfil agora';
      src.lastChecked = Date.now();
      return;
    }
    src.error = null;
    src.lastLink = `https://www.tiktok.com/video/${latest.id}`;
    src.lastTitle = latest.desc || 'Vídeo novo publicado';
    if (!src.lastId) {
      src.lastId = latest.id;
    } else if (src.lastId !== latest.id) {
      src.lastId = latest.id;
      await notifyAll(src.name, src.lastTitle, src.lastLink);
      await notifyDiscord(src.name, src.lastTitle, src.lastLink);
    }
    src.lastChecked = Date.now();
  } catch (e) {
    src.error = 'Não consegui acessar agora';
    src.lastChecked = Date.now();
  }
}

async function checkAllSources() {
  for (const src of sources) {
    await checkSource(src);
  }
  writeJSON(SOURCES_FILE, sources);
}

async function notifyAll(name, title, link) {
  const payload = JSON.stringify({ title: `🔔 ${name} postou`, body: title, url: link });
  const stillValid = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      stillValid.push(sub);
    } catch (e) {
      // subscription expirada/inválida -> descarta
      if (e.statusCode !== 410 && e.statusCode !== 404) stillValid.push(sub);
    }
  }
  subscriptions = stillValid;
  writeJSON(SUBS_FILE, subscriptions);
}

async function notifyDiscord(name, title, link) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🔔 **${name}** postou um vídeo novo!\n${title}\n${link}`
      })
    });
  } catch (e) {
    console.error('Falha ao enviar pro Discord:', e.message);
  }
}

// ---------- ROTAS ----------
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!subscriptions.find(s => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
    writeJSON(SUBS_FILE, subscriptions);
  }
  res.status(201).json({ ok: true });
});

app.get('/api/sources', (req, res) => {
  res.json(sources);
});

app.post('/api/sources', async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'nome e url são obrigatórios' });
  const src = {
    id: 's' + Date.now() + Math.random().toString(36).slice(2, 7),
    name, url: normalizeTikTokUrl(url),
    lastId: null, lastTitle: null, lastLink: null, lastChecked: null, error: null
  };
  sources.push(src);
  writeJSON(SOURCES_FILE, sources);
  await checkSource(src);
  writeJSON(SOURCES_FILE, sources);
  res.status(201).json(src);
});

app.delete('/api/sources/:id', (req, res) => {
  sources = sources.filter(s => s.id !== req.params.id);
  writeJSON(SOURCES_FILE, sources);
  res.json({ ok: true });
});

app.post('/api/check-now', async (req, res) => {
  await checkAllSources();
  res.json(sources);
});

app.listen(PORT, () => {
  console.log(`Notify Viral rodando na porta ${PORT}`);
});

// checagem automática recorrente, mesmo sem ninguém com o app aberto
cron.schedule(CHECK_CRON, () => {
  console.log('Checando fontes...', new Date().toISOString());
  checkAllSources();
});
