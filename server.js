import express from "express";
import fs from "fs";
import cors from "cors";
import bodyParser from "body-parser";
import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

/* ───────────────── CONFIG ───────────────── */

const PORT = process.env.PORT || 3000;
const RPC_URL = "https://api.mainnet-beta.solana.com";
const LIVE_MINT = true; // ← SET false to disable real minting

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

/* ───────────────── SAFE FILE LOADERS ───────────────── */

function loadJSON(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/* ───────────────── LOAD DATA ───────────────── */

const whitelist = loadJSON("./whitelist.json", []);
const minted = loadJSON("./minted.json", []);

const secret = loadJSON(process.env.AUTHORITY_PATH || "", null);
if (!secret || !Array.isArray(secret)) {
  console.error("❌ AUTHORITY KEYPAIR MISSING OR INVALID");
  process.exit(1);
}

const connection = new Connection(RPC_URL, "confirmed");
const metaplex = Metaplex.make(connection).use(
  keypairIdentity(
    metaplex.identity().createFromSecretKey(Uint8Array.from(secret))
  )
);

/* ───────────────── EXPRESS ───────────────── */

const app = express();

/* 🔥 CORS — THIS IS THE FIX 🔥 */
app.use(cors({
  origin: "*",
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"]
}));

/* Handle preflight */
app.options("*", (_, res) => res.sendStatus(200));

app.use(bodyParser.json());

/* ───────────────── HEALTH ───────────────── */

app.get("/", (_, res) => {
  res.json({ status: "Fundoshi backend live" });
});

/* ───────────────── DRY RUN CHECK ───────────────── */

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ eligible: false });

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (minted.includes(wallet)) {
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });
    }

    const candy = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const remaining = candy.itemsAvailable.toNumber() -
                      candy.itemsRedeemed.toNumber();

    if (remaining <= 0) {
      return res.json({ eligible: false, reason: "SOLD_OUT" });
    }

    return res.json({
      eligible: true,
      reason: "OK",
      remaining
    });

  } catch (err) {
    console.error(err);
    return res.json({ eligible: false, reason: "ERROR" });
  }
});

/* ───────────────── LIVE MINT ───────────────── */

app.post("/mint", async (req, res) => {
  try {
    if (!LIVE_MINT) {
      return res.status(403).json({ error: "MINT_DISABLED" });
    }

    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "NO_WALLET" });

    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "NOT_WHITELISTED" });
    }

    if (minted.includes(wallet)) {
      return res.status(403).json({ error: "ALREADY_MINTED" });
    }

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const { nft } = await metaplex.candyMachines().mint({
      candyMachine,
      owner: new PublicKey(wallet)
    });

    minted.push(wallet);
    fs.writeFileSync("./minted.json", JSON.stringify(minted, null, 2));

    return res.json({
      success: true,
      mint: nft.address.toBase58()
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "MINT_FAILED" });
  }
});

/* ───────────────── START ───────────────── */

app.listen(PORT, () => {
  console.log(`🚀 Fundoshi backend live on port ${PORT}`);
});
