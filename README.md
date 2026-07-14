# Notify Viral

App que monitora perfis do TikTok e manda notificação push pro celular
quando sai vídeo novo — funciona mesmo com o app fechado, porque quem
faz a checagem é o servidor, não o navegador.

## Como rodar na Railway (passo a passo)

1. Crie uma conta em https://railway.app (dá pra entrar com GitHub)
2. Clique em **New Project** → **Deploy from GitHub repo** (suba esta pasta
   pro seu GitHub primeiro) — ou use **Empty Project** e depois o botão
   **Deploy** → **Upload Files**, enviando o conteúdo desta pasta.
3. Depois do deploy, vá em **Variables** e adicione (opcional, já vem um
   par de chaves padrão pronto pra teste, mas o ideal é gerar o seu):
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   
   Pra gerar suas próprias chaves, rode localmente: `npx web-push generate-vapid-keys`
4. A Railway detecta o `package.json` e roda `npm start` sozinha.
5. Em **Settings**, copie o domínio público (algo como
   `notify-viral-production.up.railway.app`).
6. Abra esse domínio no navegador do celular, toque em **Ativar** no banner
   de notificações, e no iPhone use **Compartilhar → Adicionar à Tela de
   Início** (no Android não precisa desse passo extra).

## Notificação via Discord (recomendado — mais confiável que o push do navegador)

1. No Discord, cria um servidor só seu (ou usa um que já tem)
2. Vai em **Configurações do Canal** → **Integrações** → **Webhooks** → **Novo Webhook**
3. Copia a **URL do Webhook**
4. Na Railway, vai em **Variables** e adiciona:
   - `DISCORD_WEBHOOK_URL` = (cola a URL copiada)
5. Pronto — quando detectar vídeo novo, a mensagem cai no canal do Discord,
   e o próprio app do Discord (que já é confiável em push) te avisa no celular.

Você pode usar o Discord, o push do navegador, ou os dois ao mesmo tempo —
são independentes.

## Rodando localmente pra testar antes

```bash
npm install
npm start
```

Depois abra http://localhost:3000

## Estrutura

- `server.js` — servidor Express: guarda as páginas monitoradas, roda a
  checagem a cada 5 minutos (cron) e envia push quando detecta vídeo novo.
- `public/` — a interface (PWA) e o service worker (`sw.js`) que recebe
  a notificação mesmo com a aba fechada.
- `data/` — onde ficam salvos os perfis monitorados e as inscrições de
  notificação (arquivos JSON simples — sem banco de dados externo).

## Limite real (leia antes de usar)

O TikTok não tem uma forma oficial e gratuita de monitorar perfis de
fora do app. Este servidor lê o HTML público do perfil pra achar o
vídeo mais recente — isso pode parar de funcionar a qualquer momento se
o TikTok mudar a página ou bloquear o acesso. Não é bug do app: é a
natureza de depender de algo que o TikTok não disponibiliza oficialmente.
Se algum perfil específico parar de atualizar, me avise que dá pra
ajustar a forma de leitura.
