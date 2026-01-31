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

// ───────────────────────── CONFIG ─────────────────────────

const PORT = process.env.PORT || 3000;
const RPC_URL = "https://api.mainnet-beta.solana.com";
const LIVE_MINT = true;

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

// ──────────────────────── LOAD FILES ──────────────────────

const whitelist = JSON.parse(
  fs.readFileSync("./whitelist.json", "utf8")
).whitelist;

const mintedData = JSON.parse(
  fs.readFileSync("./minted.json", "utf8")
);

const authority = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync("./authority.json", "utf8"))
  )
);

// ───────────────────── SOLANA / METAPLEX ───────────────────

const connection = new Connection(RPC_URL, "confirmed");
const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(authority));

// ───────────────────────── SERVER ─────────────────────────

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "Fundoshi mint backend live" });
});

// ────────────────────── DRY-RUN CHECK ──────────────────────

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) {
      return res.json({ eligible: false, reason: "NO_WALLET" });
    }

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (mintedData.minted.includes(wallet)) {
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });
    }

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const remaining =
      Number(candyMachine.itemsAvailable) -
      Number(candyMachine.itemsRedeemed);

    if (remaining <= 0) {
      return res.json({ eligible: false, reason: "SOLD_OUT" });
    }

    return res.json({
      eligible: true,
      reason: "OK",
      remaining
    });

  } catch (err) {
    return res.json({
      eligible: false,
      reason: "INTERNAL_ERROR",
      message: err.message
    });
  }
});

// ───────────────────────── MINT ───────────────────────────

app.post("/mint", async (req, res) => {
  try {
    if (!LIVE_MINT) {
      return res.status(403).json({ error: "MINT_DISABLED" });
    }

    const { wallet } = req.body;
    if (!wallet) {
      return res.status(400).json({ error: "NO_WALLET" });
    }

    if (!whitelist.includes(wallet)) {
      return res.status(403).json({ error: "NOT_WHITELISTED" });
    }

    if (mintedData.minted.includes(wallet)) {
      return res.status(403).json({ error: "ALREADY_MINTED" });
    }

    const user = new PublicKey(wallet);

    const { response } = await metaplex.candyMachines().mint({
      candyMachine: CANDY_MACHINE_ID,
      payer: authority,
      owner: user
    });

    mintedData.minted.push(wallet);
    fs.writeFileSync(
      "./minted.json",
      JSON.stringify(mintedData, null, 2)
    );

    return res.json({
      success: true,
      signature: response.signature
    });

  } catch (err) {
    return res.status(500).json({
      error: "MINT_FAILED",
      message: err.message
    });
  }
});

// ───────────────────────── START ──────────────────────────

app.listen(PORT, () => {
  console.log(`Fundoshi backend running on port ${PORT}`);
});
