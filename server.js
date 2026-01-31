// ─────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────
import express from "express";
import fs from "fs";
import cors from "cors";

import {
  Connection,
  Keypair,
  PublicKey
} from "@solana/web3.js";

import {
  Metaplex,
  keypairIdentity
} from "@metaplex-foundation/js";

// ─────────────────────────────────────────────
// FILE PATHS
// ─────────────────────────────────────────────
const WHITELIST_FILE = "./whitelist.json";
const MINTED_FILE = "./minted.json";

// ─────────────────────────────────────────────
// SAFE FILE INITIALIZATION
// ─────────────────────────────────────────────
if (!fs.existsSync(WHITELIST_FILE)) {
  fs.writeFileSync(WHITELIST_FILE, "");
}

if (!fs.existsSync(MINTED_FILE)) {
  fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
}

// ─────────────────────────────────────────────
// HELPER FUNCTIONS  ✅ (THIS FIXES ALL .includes ERRORS)
// ─────────────────────────────────────────────
const readWhitelist = () =>
  fs.readFileSync(WHITELIST_FILE, "utf8")
    .split("\n")
    .map(w => w.trim())
    .filter(Boolean);

const readMinted = () => {
  try {
    const data = JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const markMinted = (wallet) => {
  const minted = readMinted();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
  }
};

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const RPC_URL = "https://solana-mainnet.gateway.tatum.io";
const PORT = process.env.PORT || 3000;

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

// ─────────────────────────────────────────────
// AUTHORITY KEYPAIR (FROM ENV — RAILWAY SAFE)
// ─────────────────────────────────────────────
if (!process.env.AUTHORITY_SECRET_KEY) {
  throw new Error("❌ AUTHORITY_SECRET_KEY env var missing");
}

const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.AUTHORITY_SECRET_KEY))
);

// ─────────────────────────────────────────────
// SOLANA + METAPLEX
// ─────────────────────────────────────────────
const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(authority));

// ─────────────────────────────────────────────
// EXPRESS SERVER + CORS
// ─────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: "*",
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"]
}));

app.use(express.json());

// ─────────────────────────────────────────────
// DRY-RUN CHECK (NO MINT)
// ─────────────────────────────────────────────
app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.json({ eligible: false, reason: "NO_WALLET" });

    const whitelist = readWhitelist();
    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    const minted = readMinted();
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
      reason: "OK",
      remaining
    });

  } catch (err) {
    console.error("CHECK ERROR:", err);
    return res.json({ eligible: false, reason: "INTERNAL_ERROR" });
  }
});

// ─────────────────────────────────────────────
// LIVE MINT (RETURNS TX — FRONTEND SIGNS)
// ─────────────────────────────────────────────
app.post("/mint", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet required" });

    const whitelist = readWhitelist();
    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "Not whitelisted" });
    }

    const minted = readMinted();
    if (minted.includes(wallet)) {
      return res.status(403).json({ error: "Already minted" });
    }

    const user = new PublicKey(wallet);

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const mintBuilder = metaplex
      .candyMachines()
      .builders()
      .mint({
        candyMachine,
        payer: user
      });

    const transaction = await mintBuilder.build(connection);

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = user;

    transaction.partialSign(authority);

    markMinted(wallet);

    return res.json({
      tx: transaction.serialize({ requireAllSignatures: false }).toString("base64")
    });

  } catch (err) {
    console.error("MINT ERROR:", err);
    return res.status(500).json({ error: err.message || "Mint failed" });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Fundoshi backend running on port ${PORT}`);
});
