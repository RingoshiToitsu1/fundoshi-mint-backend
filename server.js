import express from "express";
import cors from "cors";
import fs from "fs";

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
// CONFIG
// ─────────────────────────────────────────────

const RPC_URL = "https://api.mainnet-beta.solana.com";
const PORT = Number(process.env.PORT || 3000);

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

// ─────────────────────────────────────────────
// LOAD AUTHORITY (FROM RAILWAY ENV VAR)
// ─────────────────────────────────────────────

if (!process.env.AUTHORITY_SECRET_KEY) {
  console.error("❌ AUTHORITY_SECRET_KEY env var missing");
  process.exit(1);
}

let authority;
try {
  const secret = JSON.parse(process.env.AUTHORITY_SECRET_KEY);
  authority = Keypair.fromSecretKey(Uint8Array.from(secret));
  console.log("✅ Authority loaded:", authority.publicKey.toBase58());
} catch (e) {
  console.error("❌ AUTHORITY KEYPAIR INVALID");
  process.exit(1);
}

// ─────────────────────────────────────────────
// LOAD WHITELIST
// ─────────────────────────────────────────────

const whitelist = fs
  .readFileSync("./whitelist.json", "utf8")
  .split("\n")
  .map(w => w.trim())
  .filter(Boolean);

// ─────────────────────────────────────────────
// MINT TRACKING (ONE MINT PER WALLET)
// ─────────────────────────────────────────────

const mintedFile = "./minted.json";
if (!fs.existsSync(mintedFile)) {
  fs.writeFileSync(mintedFile, JSON.stringify([]));
}

const getMintedWallets = () =>
  JSON.parse(fs.readFileSync(mintedFile, "utf8"));

const markMinted = (wallet) => {
  const minted = getMintedWallets();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(mintedFile, JSON.stringify(minted, null, 2));
  }
};

// ─────────────────────────────────────────────
// SOLANA + METAPLEX
// ─────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(authority));

// ─────────────────────────────────────────────
// EXPRESS + CORS (LOVABLE SAFE)
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
    if (!wallet) {
      return res.json({ eligible: false, reason: "NO_WALLET" });
    }

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (getMintedWallets().includes(wallet)) {
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
    console.error(err);
    return res.json({
      eligible: false,
      reason: "INTERNAL_ERROR"
    });
  }
});

// ─────────────────────────────────────────────
// LIVE MINT (USER SIGNS, AUTHORITY SIGNS)
// ─────────────────────────────────────────────

app.post("/mint", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: "Wallet required" });
    }

    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "Not whitelisted" });
    }

    if (getMintedWallets().includes(wallet)) {
      return res.status(403).json({ error: "Already minted" });
    }

    const user = new PublicKey(wallet);

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const { transaction } = await metaplex
      .candyMachines()
      .mint({
        candyMachine,
        payer: user
      });

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
// START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Fundoshi mint backend live on port ${PORT}`);
});
