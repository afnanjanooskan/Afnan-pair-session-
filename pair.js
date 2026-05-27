const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");

let router = express.Router();

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

function removeFile(FilePath) {
  if (!fs.existsSync(FilePath)) return false;
  fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get("/", async (req, res) => {
  let num = req.query.number;

  async function RobinPair() {
    const sessionDir = `./session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
      let RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },

        printQRInTerminal: false,

        logger: pino({ level: "fatal" }).child({ level: "fatal" }),

        browser: Browsers.macOS("Safari"),
      });

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);

        num = num.replace(/[^0-9]/g, "");

        const code = await RobinPairWeb.requestPairingCode(num);

        if (!res.headersSent) {
          await res.send({ code });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;

        if (connection === "open") {
          try {
            await delay(10000);

            const sessionPrabath = fs.readFileSync(
              "./session/creds.json"
            );

            const auth_path = sessionDir + "/";

            const user_jid = jidNormalizedUser(
              RobinPairWeb.user.id
            );

            function randomMegaId(
              length = 6,
              numberLength = 4
            ) {
              const characters =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

              let result = "";

              for (let i = 0; i < length; i++) {
                result += characters.charAt(
                  Math.floor(
                    Math.random() * characters.length
                  )
                );
              }

              const number = Math.floor(
                Math.random() * Math.pow(10, numberLength)
              );

              return `${result}${number}`;
            }

            const mega_url = await upload(
              fs.createReadStream(auth_path + "creds.json"),
              `${randomMegaId()}.json`
            );

            const string_session = mega_url.replace(
              "https://mega.nz/file/",
              ""
            );

            const sid =
              `*Everything is Afnan*\n\n` +
              `👉 ${string_session} 👈\n\n` +
              `*This is the your Session ID, copy this id and paste into config.js file*`;

            const mg =
              `🛑*Don't share this code to anyone*🛑`;

            const dt = await RobinPairWeb.sendMessage(
              user_jid,
              {
                image: {
                  url: "https://raw.githubusercontent.com/afnanjanooskan/Afnan-pair-session-/main/bot_image.jpg",
                },

                caption: sid,
              }
            );

            const msg = await RobinPairWeb.sendMessage(
              user_jid,
              {
                text: string_session,
              }
            );

            const msg1 = await RobinPairWeb.sendMessage(
              user_jid,
              {
                text: mg,
              }
            );

          } catch (e) {
            exec("pm2 restart afnan-bot");
          }

          await delay(100);

          return await removeFile(sessionDir);

        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          await delay(10000);

          RobinPair();
        }
      });

    } catch (err) {
      exec("pm2 restart afnan-bot");

      console.log("service restarted");

      RobinPair();

      await removeFile(sessionDir);

      if (!res.headersSent) {
        await res.send({
          code: "Service Unavailable",
        });
      }
    }
  }

  return await RobinPair();
});

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);

  exec("pm2 restart Robin");
});

module.exports = router;
