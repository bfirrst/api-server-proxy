/* ────────── server.js ──────────
   Express + GramJS + proxy support
────────────────────────────────── */
const express          = require("express");
const { URL }          = require("url");
const { StringSession }= require("telegram/sessions");
const { TelegramClient } = require("telegram");

const app = express();
app.use(express.json());

/* Telegram API keys */
const apiId   = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

/* ── helper: преобразуем proxy в формат GramJS ── */
function toGramJsProxy(input) {
  if (!input) return null;

  // Формат массива из таблицы [code, host, port, "True", user, pass]
  if (Array.isArray(input)) {
    const [code, host, port, authFlag, user = "", pass = ""] = input;
    return authFlag === "True"
      ? [code, host, port, user, pass]
      : [code, host, port];
  }

  // Строка-URL вида socks5://user:pass@host:port
  const u     = new URL(String(input));
  const host  = u.hostname;
  const port  = Number(u.port || 1080);
  if (!host || !port) return null;           // хоста или порта нет — без прокси

  const protoMap = { "socks4:": 1, "socks5:": 2, "http:": 3 };
  const code = protoMap[u.protocol] || 2;    // default SOCKS5

  return (u.username || u.password)
    ? [code, host, port, u.username, u.password]
    : [code, host, port];
}

/* ── создаём клиента ── */
async function createClient(sessionString, proxyRaw) {
  const proxy = toGramJsProxy(proxyRaw);

  // DEBUG
  console.log("proxyRaw :", proxyRaw);
  console.log("proxyConf:", proxy);

  return new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { proxy, connectionRetries: 3 }
  );
}

/* ── routes ───────────────────── */
app.get("/", (_, res) => res.send("Server is running ✅"));

app.post("/send", async (req, res) => {
  const { sessionString, username, message, proxy } = req.body;
  if (!sessionString || !username || !message)
    return res.status(400).json({ success:false, error:"Missing parameters" });

  try {
    const client = await createClient(sessionString, proxy);

    await client.connect();                       // ← вместо start()
    if (!client.connected)
      throw new Error("Telegram connect failed");

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
    const client = await createClient(sessionString, proxy);
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
    const client = await createClient(sessionString, proxy);
    await client.connect();
    await client.getMe();
    await client.disconnect();
    res.json({ success:true, status:"valid" });
  } catch (err) {
    res.status(500).json({ success:false, error:err.message });
  }
});

/* ── launch ───────────────────── */
const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on", port));
