/* ───────────── server.js ─────────────
   Express + GramJS + авторизованный proxy
   (исправлены SOCKS-коды и DEBUG-лог)
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

/* ── helper ── преобразуем proxy в формат, который понимает GramJS → socks */
function toGramJsProxy(raw) {
  if (!raw) return null;

  /* 1) массив из таблицы: [code, host, port, "True", user, pass] */
  if (Array.isArray(raw)) {
    let [code, host, port, flag, user = "", pass = ""] = raw;

    /* старые обозначения: 1→SOCKS4, 2→SOCKS5 ⇒ конвертируем */
    if (code === 1) code = 4;
    if (code === 2) code = 5;

    return flag === "True"
      ? { socksType: code, ip: host, port, userId: user, password: pass }
      : [code, host, port];
  }

  /* 2) строка-URL вида socks5://user:pass@host:port */
  try {
    const u     = new URL(String(raw));
    const host  = u.hostname;
    const port  = Number(u.port || 1080);
    if (!host || !port) return null;

    const protoMap = { "socks4:": 4, "socks5:": 5, "http:": 3 };
    const code = protoMap[u.protocol] || 5;         // default SOCKS5

    return (u.username || u.password)
      ? { socksType: code, ip: host, port, userId: u.username, password: u.password }
      : [code, host, port];
  } catch {
    return null;                                    // некорректная строка
  }
}

/* ── создаём Telegram-клиент ── */
function createClient(sessionString, proxyRaw) {
  const proxyConf = toGramJsProxy(proxyRaw);

  /* DEBUG */
  console.log(
    "DEBUG proxy ▶",
    JSON.stringify({ raw: proxyRaw, conf: proxyConf }, null, 2)
  );

  return new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { proxy: proxyConf, connectionRetries: 3 }
  );
}

/* ── routes ─────────────────────────── */
app.get("/", (_, res) => res.send("Server is running ✅"));

app.post("/send", async (req, res) => {
  const { sessionString, username, message, proxy } = req.body;
  if (!sessionString || !username || !message)
    return res.status(400).json({ success:false, error:"Missing parameters" });

  try {
    const client = createClient(sessionString, proxy);
    await client.start();                                     // StringSession
    await client.sendMessage(username, { message });
    await client.disconnect();
    res.json({ success:true });
  } catch (err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

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

/* ── launch ─────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on", port));
