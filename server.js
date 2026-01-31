import express from "express";
import fs from "fs";
import cors from "cors";
import { Connection, PublicKey } from "@solana/web3.js";

const app = express();
const PORT = process.env.PORT || 3000;

const RPC_URL = "https://api.mainnet-beta.solana.com";
const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

const WHITELIST_FILE = "./whitelist.json";
const MINTED_FILE = "./minted.json";

/* ─────────────────────────────
   LOAD WHITELIST (ARRAY)
───────────────────────────── */
const whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf8"));

/* ─────────────────────────────
   ENSURE MINTED FILE IS ARRAY
───────────────────────────── */
function ensureMintedFile() {
  if (!fs.existsSync(MINTED_FILE)) {
    fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));
    if (!Array.isArray(data)) {
      fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
    }
  } catch {
    fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
  }
}

ensureMintedFile();

/* ─────────────────────────────
   SAFE HELPERS
───────────────────────────── */
function getMinted() {
  try {
    const data = JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function markMinted(wallet) {
  const minted = getMinted();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
  }
}

/* ─────────────────────────────
   EXPRESS + CORS
───────────────────────────── */
app.use(cors({ origin: "*", methods: ["POST", "OPTIONS"] }));
app.use(express.json());

/* ─────────────────────────────
   DRY-RUN CHECK (NO MINT)
───────────────────────────── */
app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.json({ eligible: false, reason: "NO_WALLET" });

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (getMinted().includes(wallet)) {
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });
    }

    const connection = new Connection(RPC_URL);
    const cmAccount = await connection.getAccountInfo(CANDY_MACHINE_ID);

    if (!cmAccount) {
      return res.json({ eligible: false, reason: "CM_NOT_FOUND" });
    }

    return res.json({ eligible: true });

  } catch (err) {
    console.error("CHECK ERROR:", err);
    return res.json({ eligible: false, reason: "INTERNAL_ERROR" });
  }
});

/* ─────────────────────────────
   RECORD MINT (CALLED AFTER SUCCESS)
───────────────────────────── */
app.post("/mint/record", (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "Wallet required" });

  markMinted(wallet);
  return res.json({ ok: true });
});

/* ─────────────────────────────
   START SERVER
───────────────────────────── */
app.listen(PORT, () => {
  console.log(`✅ Fundoshi backend running on port ${PORT}`);
});
