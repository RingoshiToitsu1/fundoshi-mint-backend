import express from "express";
import fs from "fs";
import cors from "cors";
import { Connection, PublicKey } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";

/* ───────── CONFIG ───────── */

const PORT = process.env.PORT || 3000;
const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=0267bb20-16b0-42e9-a5f0-c0c0f0858502";

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

const WHITELIST_FILE = "./whitelist.json";
const MINTED_FILE = "./minted.json";

/* ───────── FILE SAFETY ───────── */

if (!fs.existsSync(WHITELIST_FILE)) {
  fs.writeFileSync(WHITELIST_FILE, "");
}

if (!fs.existsSync(MINTED_FILE)) {
  fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
}

/* ───────── HELPERS ───────── */

const readWhitelist = () =>
  fs
    .readFileSync(WHITELIST_FILE, "utf8")
    .split("\n")
    .map(w => w.trim())
    .filter(Boolean);

const readMinted = () =>
  JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));

const markMinted = (wallet) => {
  const minted = readMinted();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
  }
};

/* ───────── SOLANA ───────── */

const connection = new Connection(RPC_URL, "confirmed");
const metaplex = Metaplex.make(connection);

/* ───────── EXPRESS ───────── */

const app = express();

app.use(cors({ origin: "*", methods: ["POST", "OPTIONS"] }));
app.use(express.json());

/* ───────── DRY-RUN CHECK ───────── */

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.json({ eligible: false, reason: "NO_WALLET" });
    }

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
      remaining
    });

  } catch (err) {
    console.error(err);
    return res.json({
      eligible: false,
      reason: "INTERNAL_ERROR"
    });
  }
});

/* ───────── CONFIRM MINT (called AFTER frontend mint success) ───────── */

app.post("/mint/confirm", (req, res) => {
  const { wallet } = req.body;
  if (!wallet) {
    return res.status(400).json({ error: "Wallet required" });
  }

  markMinted(wallet);
  return res.json({ ok: true });
});

/* ───────── START ───────── */

app.listen(PORT, () => {
  console.log(`🚀 Fundoshi backend running on port ${PORT}`);
});
