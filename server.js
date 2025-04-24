/* ───────── server.js  (GramJS + SOCKS-proxy) ───────── */
const express = require("express");
const { StringSession } = require("telegram/sessions");
const { TelegramClient } = require("telegram");
const { URL } = require("url");

const app = express();
app.use(express.json());

/* свои API-ключи Telegram */
const apiId   = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

/* ── utils ──────────────────────────────────────────── */
function toGramJsProxy(input) {
  /* Принимаем либо строку-URL ('socks5://user:pass@host:port'),
     либо старый массив [typeCode, host, port, "True", user, pass]. */
  if (!input) return null;

  /* уже массив → вернём как есть */
  if (Array.isArray(input)) return input;

  /* строка-URL → разбираем */
  const u = new URL(input);
  const type = u.protocol.replace(":", "");       // socks5 / socks4 / http
  const host = u.hostname;
  const port = Number(u.port);
  const user = u.username || undefined;
  const pass = u.password || undefined;

  /* GramJS формат: [type, host, port, user?, pass?] */
  return user || pass
    ? [type, host, port, user, pass]
    : [type, host, port];
}

async function createClient(sessionString, proxyRaw) {
  const proxyConf = toGramJsProxy(proxyRaw);

  return new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { proxy: proxyConf, connectionRetries: 3 }
  );
}

/* ── routes ─────────────────────────────────────────── */
app.get("/", (_, res) => res.send("Server is running ✅"));

app.post("/send", async (req, res) => {
  const { sessionString, username, message, proxy } = req.body;
  if (!sessionString || !username || !message)
    return res.status(400).json({ success: false, error: "Missing parameters" });

  try {
    const client = await createClient(sessionString, proxy);
    await client.start();
    await client.sendMessage(username, message);
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
    const bio = entity?.about || "";          // для ботов entity.botInfo?.description
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
    await client.getMe();                    // просто пинг
    await client.disconnect();
    res.json({ success: true, status: "valid" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── start ──────────────────────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on port", port));
