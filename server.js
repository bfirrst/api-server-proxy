/* ───────────── server.js ─────────────
   Express + GramJS + гибкий proxy-парсер
   (доп. лог DEBUG proxy ▶ raw / conf)
────────────────────────────────────── */

const express          = require("express");
const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { URL }            = require("url");

const app = express();
app.use(express.json());

/* постоянные ключи Telegram */
const apiId   = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

/* ── helper: переводим proxy в формат GramJS ───────── */
function toGramJsProxy(raw) {
  if (!raw) return null;

  /* ─ массив из Google-таблицы: [code, host, port, "True", user, pass] */
  if (Array.isArray(raw)) {
    const [code, host, port, authFlag, user = "", pass = ""] = raw;
    return authFlag === "True"
      ? [code, host, port, user, pass]
      : [code, host, port];
  }

  /* ─ строка-URL: socks5://user:pass@host:port */
  try {
    const u     = new URL(String(raw));
    const host  = u.hostname;
    const port  = Number(u.port || 1080);
    if (!host || !port) return null;          // нет host / port → без прокси

    const proto = { "socks4:": 1, "socks5:": 2, "http:": 3 }[u.protocol] ?? 2;
    return (u.username || u.password)
      ? [proto, host, port, u.username, u.password]
      : [proto, host, port];
  } catch {                                   // String(raw) некорректен
    return null;
  }
}

/* ── создание клиента ─────────────────────────────── */
async function createClient(sessionString, proxyRaw) {
  let proxyConf = toGramJsProxy(proxyRaw);

  /* защита — если host/port потерялись, работаем без прокси */
  if (Array.isArray(proxyConf) && proxyConf.length < 3) proxyConf = null;

  /* единый debug-лог */
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

/* ── маршруты ─────────────────────────────────────── */
app.get("/", (_, res) => res.send("Server is running ✅"));

app.post("/send", async (req, res) => {
  const { sessionString, username, message, proxy } = req.body;
  if (!sessionString || !username || !message)
    return res.status(400).json({ success: false, error: "Missing parameters" });

  try {
    const client = await createClient(sessionString, proxy);
    await client.start();
    await client.sendMessage(username, { message });
    await client.disconnect();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/bio", async (req, res) => {
  const { sessionString, username, proxy } = req.body;
  if (!sessionString || !username)
    return res.status(400).json({ success: false, error: "Missing parameters" });

  try {
    const client = await createClient(sessionString, proxy);
    await client.connect();
    const entity = await client.getEntity(username);
    const bio    = entity?.about || entity?.botInfo?.description || "";
    await client.disconnect();
    res.json({ success: true, bio });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/validate", async (req, res) => {
  const { sessionString, proxy } = req.body;
  if (!sessionString)
    return res.status(400).json({ success: false, error: "Missing parameters" });

  try {
    const client = await createClient(sessionString, proxy);
    await client.connect();
    await client.getMe();
    await client.disconnect();
    res.json({ success: true, status: "valid" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── запуск ───────────────────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on", port));
