/* ────────── server.js ──────────
   Express + GramJS + proxy support
   (с отладочными логами proxyRaw / proxyConf)
────────────────────────────────── */
const express = require("express");
const { StringSession } = require("telegram/sessions");
const { TelegramClient } = require("telegram");
const { URL } = require("url");

const app = express();
app.use(express.json());

/* Telegram API keys — фиксированные */
const apiId   = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

/* ── helper: преобразуем proxy в формат GramJS ── */
function toGramJsProxy(input) {
  if (!input) return null;

  /* Формат вида [code, host, port, "True", user, pass] — из таблицы */
  if (Array.isArray(input)) {
    const [code, host, port, authFlag, user = "", pass = ""] = input;
    return authFlag === "True"
      ? [code, host, port, user, pass]
      : [code, host, port];
  }

  /* Строка-URL: socks5://user:pass@host:port */
  const u = new URL(String(input));
  const host = u.hostname;
  const port = Number(u.port || 1080);
  if (!host || !port) return null;          // некорректно → без прокси

  const protoMap = { "socks4:": 1, "socks5:": 2, "http:": 3 };
  const code = protoMap[u.protocol] || 2;   // по умолчанию SOCKS5

  return (u.username || u.password)
    ? [code, host, port, u.username, u.password]
    : [code, host, port];
}

/* ── создаём клиента ── */
async function createClient(sessionString, proxyRaw) {
  const proxyConf = toGramJsProxy(proxyRaw);
  /* ─ debug ───────────────────────────── */
  console.log("DEBUG proxyRaw :", proxyRaw);
  console.log("DEBUG proxyConf:", proxyConf);
  /* ───────────────────────────────────── */
  return new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { proxy: proxyConf, connectionRetries: 3 },
  );
}

/* ── routes ───────────────────────────── */
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
    const bio = entity?.about || entity?.botInfo?.description || "";
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

/* ── launch ───────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on port", port));
