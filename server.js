/* ─────────── server.js ───────────
   Express + GramJS + proxy support
────────────────────────────────── */

const express            = require("express");
const { StringSession }  = require("telegram/sessions");
const { TelegramClient } = require("telegram");
const { URL }            = require("url");

const app = express();
app.use(express.json());

/* Telegram-key (фиксированные для всех запросов) */
const apiId   = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

/* ── helper: преобразуем proxy в формат GramJS ── */
function toGramJsProxy(input) {
  if (!input) return null;

  /* Формат из таблицы: [code, host, port, "True", user, pass] */
  if (Array.isArray(input)) {
    const [code, host, port, authFlag, user = "", pass = ""] = input;
    return authFlag === "True"
      ? { socksType: code, ip: host, port, userId: user, password: pass }
      : [code, host, port];
  }

  /* Строка-URL: socks5://user:pass@host:port */
  const u    = new URL(String(input));
  const host = u.hostname;
  const port = Number(u.port || 1080);
  if (!host || !port) return null;                 // нет host/port → без прокси

  const protoMap = { "socks4:": 1, "socks5:": 2, "http:": 3 };
  const code     = protoMap[u.protocol] || 2;      // default SOCKS5

  return (u.username || u.password)
    ? { socksType: code, ip: host, port, userId: u.username, password: u.password }
    : [code, host, port];
}

/* ── создаём Telegram-клиент ── */
function createClient(sessionString, proxyRaw) {
  return new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { proxy: toGramJsProxy(proxyRaw), connectionRetries: 3 },
  );
}

/* ── routes ────────────────────────────────────── */
app.get("/", (_, res) => res.send("Server is running ✅"));

/* Отправить сообщение */
app.post("/send", async (req, res) => {
  const { sessionString, username, message, proxy } = req.body;
  if (!sessionString || !username || !message) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }
  try {
    const client = createClient(sessionString, proxy);
    await client.start();
    await client.sendMessage(username, { message });
    await client.disconnect();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Получить био */
app.post("/bio", async (req, res) => {
  const { sessionString, username, proxy } = req.body;
  if (!sessionString || !username) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }
  try {
    const client = createClient(sessionString, proxy);
    await client.connect();
    const entity = await client.getEntity(username);
    const bio = entity?.about || entity?.botInfo?.description || "";
    await client.disconnect();
    res.json({ success: true, bio });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Проверить валидность сессии */
app.post("/validate", async (req, res) => {
  const { sessionString, proxy } = req.body;
  if (!sessionString) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }
  try {
    const client = createClient(sessionString, proxy);
    await client.connect();
    await client.getMe();
    await client.disconnect();
    res.json({ success: true, status: "valid" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── launch ────────────────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on port", port));
