import express from "express";
import fs from "fs";
import bodyParser from "body-parser";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

// ─────────────────────────────────────────────
// ENV (Railway-safe)
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL;
const LIVE_MINT = process.env.LIVE_MINT === "TRUE";

// ─────────────────────────────────────────────
// SOLANA
// ─────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");

const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.AUTHORITY_KEYPAIR))
);

const metaplex = Metaplex.make(connection).use(
  keypairIdentity(authority)
);

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

// ─────────────────────────────────────────────
// DATA FILES
// ─────────────────────────────────────────────

const whitelist = JSON.parse(
  fs.readFileSync("./whitelist.json", "utf8")
);

const mintedPath = "./minted.json";
const minted = fs.existsSync(mintedPath)
  ? JSON.parse(fs.readFileSync(mintedPath, "utf8"))
  : [];

// ─────────────────────────────────────────────
// SERVER
// ─────────────────────────────────────────────

const app = express();
app.use(bodyParser.json());

// ─────────────────────────────────────────────
// DRY-RUN CHECK
// ─────────────────────────────────────────────

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ eligible: false });
    }

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (minted.includes(wallet)) {
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
      remaining,
      live: LIVE_MINT
    });

  } catch (err) {
    return res.status(500).json({
      eligible: false,
      reason: "INTERNAL_ERROR",
      message: err.message
    });
  }
});

// ─────────────────────────────────────────────
// LIVE MINT (LOCKED)
// ─────────────────────────────────────────────

app.post("/mint", async (_req, res) => {
  if (!LIVE_MINT) {
    return res.status(403).json({ error: "MINT_DISABLED" });
  }
  return res.status(501).json({ error: "LIVE_MINT_NOT_ENABLED_YET" });
});

// ─────────────────────────────────────────────
// BOOT (Railway-correct)
// ─────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Mint backend running on port ${PORT}`);
});
