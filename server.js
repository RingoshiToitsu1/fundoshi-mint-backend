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

/* ───────────────── CONFIG ───────────────── */

const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=0267bb20-16b0-42e9-a5f0-c0c0f0858502";
const PORT = process.env.PORT || 3000;

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

/* ─────────────── AUTHORITY ─────────────── */

if (!process.env.AUTHORITY_SECRET_KEY) {
  throw new Error("AUTHORITY_SECRET_KEY env var missing");
}

const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.AUTHORITY_SECRET_KEY))
);

/* ───────────── FILE HELPERS ───────────── */

const WHITELIST_FILE = "./whitelist.json";
const MINTED_FILE = "./minted.json";

const readList = (file) => {
  if (!fs.existsSync(file)) return [];
  const data = fs.readFileSync(file, "utf8");
  return data
    .split("\n")
    .map(x => x.trim())
    .filter(Boolean);
};

const readMinted = () => {
  if (!fs.existsSync(MINTED_FILE)) return [];
  return JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));
};

const markMinted = (wallet) => {
  const minted = readMinted();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
  }
};

/* ───────────── SOLANA / METAPLEX ───────────── */

const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(authority));

/* ───────────── EXPRESS ───────────── */

const app = express();

app.use(cors({
  origin: "*",
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

/* ───────────── DRY-RUN CHECK ───────────── */

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.json({ eligible: false });

    const whitelist = readList(WHITELIST_FILE);
    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (readMinted().includes(wallet)) {
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

    return res.json({ eligible: true, remaining });

  } catch (err) {
    console.error("CHECK ERROR:", err);
    return res.json({ eligible: false, reason: "INTERNAL_ERROR" });
  }
});

/* ───────────── LIVE MINT ───────────── */

app.post("/mint", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "Wallet required" });

    const whitelist = readList(WHITELIST_FILE);
    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "Not whitelisted" });
    }

    if (readMinted().includes(wallet)) {
      return res.status(403).json({ error: "Already minted" });
    }

    const user = new PublicKey(wallet);

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    // 🔑 THIS IS THE CRITICAL FIX
    const mintBuilder = await metaplex
      .candyMachines()
      .builders()
      .mint({
        candyMachine,
        payer: user
      });

    const transaction = await mintBuilder.toTransaction(connection);

    transaction.feePayer = user;
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
    return res.status(500).json({ error: err.message });
  }
});

/* ───────────── START SERVER ───────────── */

app.listen(PORT, () => {
  console.log(`🚀 Fundoshi backend live on port ${PORT}`);
});
