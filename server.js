/* ───────────── server.js ─────────────
   Express + GramJS + proxy-support
   (корректный формат прокси + DEBUG-лог)
────────────────────────────────────── */

const express            = require("express");
const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { URL }            = require("url");

const app = express();
app.use(express.json());

/* Telegram API keys (фиксированные) */
const apiId   = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

/* ── helper: переводим proxy в формат GramJS ── */
function toGramJsProxy(raw) {
  if (!raw) return null;

  /* 1) массив из Google-таблицы: [code, host, port, "True", user, pass] */
  if (Array.isArray(raw)) {
    const [code, host, port, flag, user = "", pass = ""] = raw;
    return flag === "True"
      ? { socksType: code, ip: host, port, userId: user, password: pass }
      : [code, host, port];
  }

  /* 2) строка-URL: socks5://user:pass@host:port  */
  try {
    const u    = new URL(String(raw));
    const host = u.hostname;
    const port = Number(u.port || 1080);
    if (!host || !port) return null;                 // нет host или port

    const protoMap = { "socks4:": 1, "socks5:": 2, "http:": 3 };
    const code = protoMap[u.protocol] || 2;          // default SOCKS5

    return (u.username || u.password)
      ? { socksType: code, ip: host, port, userId: u.username, password: u.password }
      : [code, host, port];
  } catch {               // строка не распарсилась
    return null;
  }
}

/* ── создаём Telegram-клиент ── */
function createClient(sessionString, proxyRaw) {
  const proxyConf = toGramJsProxy(proxyRaw);

  /* DEBUG — показывает raw-строку/массив и конечную конфигурацию */
  console.log(
    "DEBUG proxy ▶",
    JSON.stringify({ raw: proxyRaw, conf: proxyConf }, null, 2)
  );

  return new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { proxy: proxyConf, connectionRetries: 3 },
  );
}

/* ── routes ───────────────────────────────────────── */
app.get("/", (_, res) => res.send("Server is running ✅"));

/* отправка сообщения */
app.post("/send", async (req, res) => {
  const { sessionString, username, message, proxy } = req.body;
  if (!sessionString || !username || !message)
    return res.status(400).json({ success:false, error:"Missing parameters" });

  try {
    const client = createClient(sessionString, proxy);
    await client.start();                                   // StringSession
    await client.sendMessage(username, { message });
    await client.disconnect();
    res.json({ success:true });
  } catch (err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

/* получение BIO */
app.post("/bio", async (req, res) => {
  const { sessionString, username, proxy } = req.body;
  if (!sessionString || !username)
    return res.status(400).json({ success:false, error:"Missing parameters" });

  try {
    const client = createClient(sessionString, proxy);
    await client.connect();
    const entity = await client.getEntity(username);
    const bio = entity?.about || entity?.botInfo?.description || "";
    await client.disconnect();
    res.json({ success:true, bio });
  } catch (err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

/* валидация сессии */
app.post("/validate", async (req, res) => {
  const { sessionString, proxy } = req.body;
  if (!sessionString)
    return res.status(400).json({ success:false, error:"Missing parameters" });

  try {
    const client = createClient(sessionString, proxy);
    await client.connect();
    await client.getMe();
    await client.disconnect();
    res.json({ success:true, status:"valid" });
  } catch (err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

/* ── запуск ───────────────────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on", port));
