import express from "express";
import fs from "fs";
import cors from "cors";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const RPC_URL = "https://api.mainnet-beta.solana.com";
const PORT = process.env.PORT || 3000;

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

// ─────────────────────────────────────────────
// AUTHORITY KEYPAIR (DEBUGGED)
// ─────────────────────────────────────────────

if (!process.env.AUTHORITY_SECRET_KEY) {
  console.error("❌ AUTHORITY_SECRET_KEY env var missing");
  process.exit(1);
}

let secret;
try {
  secret = JSON.parse(process.env.AUTHORITY_SECRET_KEY);
} catch (e) {
  console.error("❌ AUTHORITY_SECRET_KEY is not valid JSON");
  process.exit(1);
}

console.log("🔑 Secret type:", typeof secret);
console.log("🔑 Is array:", Array.isArray(secret));
console.log("🔑 Secret length:", secret?.length);

if (!Array.isArray(secret) || secret.length !== 64) {
  console.error("❌ INVALID SECRET KEY LENGTH — MUST BE 64");
  process.exit(1);
}

const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
console.log("✅ Authority loaded:", authority.publicKey.toBase58());

// ─────────────────────────────────────────────
// SOLANA + METAPLEX
// ─────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection).use(
  keypairIdentity(authority)
);

// ─────────────────────────────────────────────
// EXPRESS + CORS
// ─────────────────────────────────────────────

const app = express();

app.use(cors({ origin: "*", methods: ["POST", "OPTIONS"] }));
app.use(express.json());

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
