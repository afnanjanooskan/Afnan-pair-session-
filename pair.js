const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");

const router = express.Router();
const pino = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");

const { upload } = require("./mega");

// Remove folder safely
function removeFile(path) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
}

router.get("/", async (req, res) => {
  let num = req.query.number;

  if (!num) {
    return res.status(400).send({ error: "Number is required" });
  }

  num = num.replace(/[^0-9]/g, "");

  const sessionPath = `./session/${num}`;

  async function startPair() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    try {
      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "silent" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari"),
      });

      sock.ev.on("creds.update", saveCreds);

      // Request pairing code if not registered
      if (!sock.authState.creds.registered) {
        await delay(2000);

        const code = await sock.requestPairingCode(num);

        if (!res.headersSent) {
          res.send({ code });
        }
      }

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        console.log("Connection:", connection);

        if (connection === "open") {
          console.log("WhatsApp Connected");

          try {
            await delay(5000);

            const credsFile = `${sessionPath}/creds.json`;

            if (!fs.existsSync(credsFile)) {
              console.log("No creds found");
              return;
            }

            const randomId = () => {
              const chars =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
              let str = "";
              for (let i = 0; i < 6; i++) {
                str += chars.charAt(Math.floor(Math.random() * chars.length));
              }
              return str + Math.floor(Math.random() * 10000);
            };

            const uploaded = await upload(
              fs.createReadStream(credsFile),
              `${randomId()}.json`
            );

            const sessionId = uploaded.replace(
              "https://mega.nz/file/",
              ""
            );

            const userJid = jidNormalizedUser(sock.user.id);

            await sock.sendMessage(userJid, {
              image: {
                url: "https://raw.githubusercontent.com/afnanjanooskan/Afnan-pair-session-/main/bot_image.jpg",
              },
              caption: `*SESSION ID GENERATED*\n\n${sessionId}\n\nKeep it private.`,
            });

            await sock.sendMessage(userJid, {
              text: sessionId,
            });

            await sock.sendMessage(userJid, {
              text: "⚠️ Do not share this session ID with anyone",
            });

            console.log("Session sent successfully");

          } catch (err) {
            console.log("Error in open event:", err);
            exec("pm2 restart Robin");
          }

          // DO NOT delete session immediately (prevents disconnect issues)
          await delay(5000);

          console.log("Pairing completed");
        }

        // Auto retry on crash (except logout)
        if (
          connection === "close" &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          console.log("Reconnecting...");
          await delay(8000);
          startPair();
        }
      });

    } catch (err) {
      console.log("Fatal error:", err);
      exec("pm2 restart Robin");
      await removeFile(sessionPath);

      if (!res.headersSent) {
        res.send({ error: "Service error, restarted" });
      }
    }
  }

  return startPair();
});

process.on("uncaughtException", (err) => {
  console.log("Uncaught Exception:", err);
  exec("pm2 restart Robin");
});

module.exports = router;
