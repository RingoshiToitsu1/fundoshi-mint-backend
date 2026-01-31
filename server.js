import express from "express";
import fs from "fs";
import cors from "cors";
import bodyParser from "body-parser";

import {
  Connection,
  Keypair,
  PublicKey
} from "@solana/web3.js";

import {
  Metaplex,
  keypairIdentity
} from "@metaplex-foundation/js";

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */

const RPC_URL = "https://api.mainnet-beta.solana.com";
const PORT = Number(process.env.PORT) || 3000;

// Candy Machine ID
const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

// ENABLE LIVE MINT
const LIVE_MINT = true;

/* ─────────────────────────────────────────────
   LOAD AUTHORITY KEYPAIR
   (authority.json MUST be a valid Solana keypair array)
───────────────────────────────────────────── */

const authority = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync("./authority.json", "utf8"))
  )
);

/* ─────────────────────────────────────────────
   LOAD WHITELIST
───────────────────────────────────────────── */

const whitelist = JSON.parse(
  fs.readFileSync("./whitelist.json", "utf8")
);

/* ─────────────────────────────────────────────
   LOAD MINTED WALLETS (1 mint per wallet)
───────────────────────────────────────────── */

const mintedFile = "./minted.json";
let mintedWallets = fs.existsSync(mintedFile)
  ? JSON.parse(fs.readFileSync(mintedFile, "utf8"))
  : [];

/* ─────────────────────────────────────────────
   SOLANA + METAPLEX
───────────────────────────────────────────── */

const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(authority));

/* ─────────────────────────────────────────────
   EXPRESS APP
───────────────────────────────────────────── */

const app = express();

// ✅ FULL CORS ENABLED (Lovable-safe)
app.use(cors({
  origin: "*",
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"]
}));

app.use(bodyParser.json());

/* ─────────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────────── */

app.get("/", (_req, res) => {
  res.json({ status: "Fundoshi mint backend live" });
});

/* ─────────────────────────────────────────────
   DRY-RUN / ELIGIBILITY CHECK
───────────────────────────────────────────── */

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.json({ eligible: false, reason: "NO_WALLET" });
    }

    if (!LIVE_MINT) {
      return res.json({ eligible: false, reason: "NOT_LIVE" });
    }

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (mintedWallets.includes(wallet)) {
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });
    }

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const remaining =
      candyMachine.itemsAvailable.toNumber() -
      candyMachine.itemsRedeemed.toNumber();

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
    return res.json({
      eligible: false,
      reason: "INTERNAL_ERROR"
    });
  }
});

/* ─────────────────────────────────────────────
   LIVE MINT ENDPOINT
───────────────────────────────────────────── */

app.post("/mint", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: "Wallet required" });
    }

    if (!LIVE_MINT) {
      return res.status(403).json({ error: "Mint disabled" });
    }

    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "Not whitelisted" });
    }

    if (mintedWallets.includes(wallet)) {
      return res.status(403).json({ error: "Already minted" });
    }

    const user = new PublicKey(wallet);

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const { nft, response } = await metaplex
      .candyMachines()
      .mint({
        candyMachine,
        collectionUpdateAuthority: authority,
        owner: user
      });

    // Record mint
    mintedWallets.push(wallet);
    fs.writeFileSync(mintedFile, JSON.stringify(mintedWallets, null, 2));

    return res.json({
      signature: response.signature,
      mint: nft.address.toBase58()
    });

  } catch (err) {
    console.error("MINT ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`🚀 Fundoshi backend running on port ${PORT}`);
});
