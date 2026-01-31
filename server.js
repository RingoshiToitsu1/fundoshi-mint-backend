import express from "express";
import cors from "cors";
import fs from "fs";

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

// ─────────────────────────────────────────────
// CONFIG (ENV SAFE)
// ─────────────────────────────────────────────

const PORT = Number(process.env.PORT || 3000);
const RPC_URL =
  process.env.RPC_URL || "https://solana-mainnet.gateway.tatum.io";

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

// ─────────────────────────────────────────────
// AUTHORITY (NO REDEPLOY REQUIRED)
// ─────────────────────────────────────────────

if (!process.env.AUTHORITY_SECRET_KEY) {
  throw new Error("❌ AUTHORITY_SECRET_KEY env var missing");
}

const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.AUTHORITY_SECRET_KEY))
);

// ─────────────────────────────────────────────
// FILES
// ─────────────────────────────────────────────

const WHITELIST_FILE = "./whitelist.json";
const MINTED_FILE = "./minted.json";

if (!fs.existsSync(WHITELIST_FILE)) {
  fs.writeFileSync(WHITELIST_FILE, "");
}

if (!fs.existsSync(MINTED_FILE)) {
  fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
}

const getWhitelist = () =>
  fs
    .readFileSync(WHITELIST_FILE, "utf8")
    .split("\n")
    .map(w => w.trim())
    .filter(Boolean);

const getMinted = () => {
  const raw = JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));
  return Array.isArray(raw) ? raw : [];
};

const markMinted = wallet => {
  const minted = getMinted();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
  }
};

// ─────────────────────────────────────────────
// SOLANA + METAPLEX
// ─────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection).use(
  keypairIdentity(authority)
);

// ─────────────────────────────────────────────
// EXPRESS + CORS (LOVABLE SAFE)
// ─────────────────────────────────────────────

const app = express();

app.use(cors({ origin: "*", methods: ["POST", "OPTIONS"] }));
app.use(express.json());

// ─────────────────────────────────────────────
// DRY-RUN CHECK (NO MINT)
// ─────────────────────────────────────────────

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.json({ eligible: false, reason: "NO_WALLET" });

    const whitelist = getWhitelist();
    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    const minted = getMinted();
    if (minted.includes(wallet)) {
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });
    }

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const remaining =
      candyMachine.itemsAvailable.toNumber() -
      candyMachine.itemsMinted.toNumber();

    if (remaining <= 0) {
      return res.json({ eligible: false, reason: "SOLD_OUT" });
    }

    return res.json({
      eligible: true,
      remaining
    });
  } catch (err) {
    console.error("CHECK ERROR:", err);
    return res.json({ eligible: false, reason: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────
// LIVE MINT (AUTHORITY PARTIAL-SIGNS)
// ─────────────────────────────────────────────

app.post("/mint", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: "Wallet required" });
    }

    const whitelist = getWhitelist();
    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "Not whitelisted" });
    }

    const minted = getMinted();
    if (minted.includes(wallet)) {
      return res.status(403).json({ error: "Already minted" });
    }

    const user = new PublicKey(wallet);

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const builder = await metaplex
      .candyMachines()
      .builders()
      .mint({
        candyMachine,
        payer: user
      });

    const transaction = builder.toTransaction(metaplex);

    transaction.partialSign(authority);

    const serialized = transaction.serialize({
      requireAllSignatures: false
    });

    markMinted(wallet);

    return res.json({
      tx: serialized.toString("base64")
    });
  } catch (err) {
    console.error("MINT ERROR:", err);
    return res.status(500).json({
      error: err.message || "Mint failed"
    });
  }
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Fundoshi backend live on port ${PORT}`);
});
