const express = require("express");
const { StringSession } = require("telegram/sessions");
const { TelegramClient } = require("telegram");
const { URL } = require("url");

const app = express();
app.use(express.json());

const apiId = 2040;
const apiHash = "b18441a1ff607e10a989891a5462e627";

app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

async function createClient(sessionString, proxyUrl) {
  let proxyConf = null;
  if (proxyUrl) {
    const p = new URL(proxyUrl);
    proxyConf = {
      proxy_type: p.protocol.replace(":", ""),  // e.g. "http"
      addr: p.hostname,
      port: +p.port,
      username: p.username,
      password: p.password,
    };
  }
  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    proxy: proxyConf,
    connectionRetries: 3,
  });
}

app.post("/send", async (req, res) => {
  const { sessionString, username, message, proxy } = req.body;
  if (!sessionString || !username || !message) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }
  try {
    const client = await createClient(sessionString, proxy);
    await client.start();
    await client.sendMessage(username, message);
    await client.disconnect();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/bio", async (req, res) => {
  const { sessionString, apiId: id, apiHash: hash, username, proxy } = req.body;
  if (!sessionString || !id || !hash || !username) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }
  try {
    const p = proxy ? proxy : null;
    const client = await createClient(sessionString, p);
    await client.connect();
    const entity = await client.getEntity(username);
    const bio = entity.botInfo?.description || "";
    await client.disconnect();
    res.json({ success: true, bio });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/validate", async (req, res) => {
  const { sessionString, apiId: id, apiHash: hash, proxy } = req.body;
  if (!sessionString || !id || !hash) {
    return res.status(400).json({ success: false, error: "Missing parameters" });
  }
  try {
    const client = await createClient(sessionString, proxy);
    await client.connect();
    await client.getMe();
    await client.disconnect();
    res.json({ success: true, status: "valid" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log("Server listening on port", port);
});
