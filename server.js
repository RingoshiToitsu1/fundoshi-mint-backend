import express from "express";
import fs from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction
} from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

/* ================= CONFIG ================= */

const PORT = Number(process.env.PORT || 3000);
const RPC_URL = "https://api.mainnet-beta.solana.com";
const LIVE_MINT = true; // 🔓 ENABLED

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

const FUND_MINT = new PublicKey(
  "JjGQAsJBRQLYmBj41bgZggVLawaa4qoSF77NJsRpump"
);

const REQUIRED_FUND = 10_000_000;

/* ================= AUTHORITY ================= */

const AUTHORITY_KEYPAIR = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.AUTHORITY_KEYPAIR))
);

/* ================= DATA FILES ================= */

const whitelist = JSON.parse(
  fs.readFileSync("./whitelist.json", "utf8")
);

let minted = fs.existsSync("./minted.json")
  ? JSON.parse(fs.readFileSync("./minted.json", "utf8"))
  : [];

/* ================= SOLANA ================= */

const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(AUTHORITY_KEYPAIR));

/* ================= EXPRESS ================= */

const app = express();
app.use(express.json());

/* ================= HELPERS ================= */

async function getFundBalance(wallet) {
  const accounts = await connection.getParsedTokenAccountsByOwner(
    wallet,
    { mint: FUND_MINT }
  );

  if (!accounts.value.length) return 0;

  return Number(
    accounts.value[0].account.data.parsed.info.tokenAmount.amount
  );
}

/* ================= DRY CHECK ================= */

app.post("/mint/check", async (req, res) => {
  try {
    const wallet = req.body.wallet;
    if (!wallet) return res.json({ eligible: false });

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (minted.includes(wallet)) {
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });
    }

    const fundBalance = await getFundBalance(new PublicKey(wallet));
    if (fundBalance < REQUIRED_FUND) {
      return res.json({ eligible: false, reason: "INSUFFICIENT_FUND" });
    }

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    return res.json({
      eligible: true,
      reason: "OK",
      remaining: candyMachine.itemsRemaining.toNumber()
    });
  } catch (e) {
    return res.json({ eligible: false, reason: "INTERNAL_ERROR" });
  }
});

/* ================= LIVE MINT ================= */

app.post("/mint", async (req, res) => {
  try {
    if (!LIVE_MINT) {
      return res.status(403).json({ error: "MINT_DISABLED" });
    }

    const wallet = req.body.wallet;
    if (!wallet) {
      return res.status(400).json({ error: "WALLET_REQUIRED" });
    }

    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "NOT_WHITELISTED" });
    }

    if (minted.includes(wallet)) {
      return res.status(403).json({ error: "ALREADY_MINTED" });
    }

    const fundBalance = await getFundBalance(new PublicKey(wallet));
    if (fundBalance < REQUIRED_FUND) {
      return res.status(403).json({ error: "INSUFFICIENT_FUND" });
    }

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const { nft } = await metaplex.candyMachines().mint({
      candyMachine,
      payer: AUTHORITY_KEYPAIR,
      owner: new PublicKey(wallet)
    });

    minted.push(wallet);
    fs.writeFileSync("./minted.json", JSON.stringify(minted, null, 2));

    res.json({
      success: true,
      mint: nft.address.toBase58()
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`🚀 Fundoshi mint backend live on port ${PORT}`);
});
