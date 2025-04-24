/* ─────────── server.js ───────────
   Express + GramJS + Socks-proxy
   API:  GET /           – health-check
         POST /send      – send message
         POST /bio       – get user bio
         POST /validate  – check session
─────────────────────────────────── */
const express = require("express");
const { StringSession } = require("telegram/sessions");
const { TelegramClient } = require("telegram");
const { URL } = require("url");

const app = express();
app.use(express.json());

/* Telegram API keys (замените, если нужны другие) */
const apiId   = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

/* ── helpers ─────────────────────────────────────── */
function toGramJsProxy(input) {
  if (!input) return null;

  /* старый массив: [code, host, port, "True", user, pass] */
  if (Array.isArray(input)) {
    const [code, host, port, authFlag, user = "", pass = ""] = input;
    const map = { 1: "socks4", 2: "socks5", 3: "http" };
    const proto = map[code] || "socks5";
    return authFlag === "True"
      ? [proto, host, port, user, pass]
      : [proto, host, port];
  }

  /* строка-URL: socks5://user:pass@host:port */
  const u = new URL(String(input));
  const proto = u.protocol.replace(":", ""); // socks5 / socks4 / http
  const arr = [proto, u.hostname, Number(u.port || 1080)];
  if (u.username || u.password) arr.push(u.username, u.password);
  return arr;
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

/* ── routes ───────────────────────────────────────── */
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
    const bio = entity?.about || "";               // для ботов botInfo?.description
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
    await client.getMe();      // простой пинг
    await client.disconnect();
    res.json({ success: true, status: "valid" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── launch ───────────────────────────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on port", port));
