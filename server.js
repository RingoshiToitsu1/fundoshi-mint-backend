import express from "express";
import fs from "fs";
import bodyParser from "body-parser";

import {
  Connection,
  PublicKey,
  Keypair
} from "@solana/web3.js";

import {
  Metaplex,
  keypairIdentity
} from "@metaplex-foundation/js";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const RPC_URL = "https://api.mainnet-beta.solana.com";
const PORT = process.env.PORT || 3000;

const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

const FUND_TOKEN_MINT = new PublicKey(
  "JjGQAsJBRQLYmBj41bgZggVLawaa4qoSF77NJsRpump"
);

const REQUIRED_FUND = 10_000_000;

// ─────────────────────────────────────────────
// LOAD FILES
// ─────────────────────────────────────────────

const whitelist = JSON.parse(
  fs.readFileSync("./whitelist.json", "utf8")
);

const mintedWallets = JSON.parse(
  fs.readFileSync("./minted.json", "utf8")
);

const authority = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(fs.readFileSync("./authority.json", "utf8"))
  )
);

// ─────────────────────────────────────────────
// SOLANA + METAPLEX
// ─────────────────────────────────────────────

const connection = new Connection(RPC_URL, "confirmed");

const metaplex = Metaplex.make(connection)
  .use(keypairIdentity(authority));

// ─────────────────────────────────────────────
// EXPRESS
// ─────────────────────────────────────────────

const app = express();
app.use(bodyParser.json());

// ─────────────────────────────────────────────
// HEALTH CHECK (FOR RAILWAY / LOVABLE)
// ─────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.send("FUNDOSHI mint backend is live");
});

// ─────────────────────────────────────────────
// DRY-RUN CHECK
// ─────────────────────────────────────────────

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;

    if (!wallet)
      return res.json({ eligible: false, reason: "NO_WALLET" });

    if (!Array.isArray(whitelist) || !whitelist.includes(wallet))
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });

    if (mintedWallets.includes(wallet))
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });

    const user = new PublicKey(wallet);

    const tokenAccounts =
      await connection.getParsedTokenAccountsByOwner(
        user,
        { mint: FUND_TOKEN_MINT }
      );

    const fundBalance = tokenAccounts.value.reduce(
      (sum, acc) =>
        sum + acc.account.data.parsed.info.tokenAmount.uiAmount,
      0
    );

    if (fundBalance < REQUIRED_FUND)
      return res.json({
        eligible: false,
        reason: "INSUFFICIENT_FUND",
        balance: fundBalance
      });

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    if (candyMachine.itemsRemaining.toNumber() <= 0)
      return res.json({ eligible: false, reason: "SOLD_OUT" });

    return res.json({
      eligible: true,
      reason: "OK",
      remaining: candyMachine.itemsRemaining.toNumber()
    });

  } catch (err) {
    return res.json({
      eligible: false,
      reason: "INTERNAL_ERROR",
      message: err.message
    });
  }
});

// ─────────────────────────────────────────────
// LIVE MINT
// ─────────────────────────────────────────────

app.post("/mint", async (req, res) => {
  try {
    const { wallet } = req.body;

    if (!wallet)
      return res.status(400).json({ error: "NO_WALLET" });

    if (!whitelist.includes(wallet))
      return res.status(403).json({ error: "NOT_WHITELISTED" });

    if (mintedWallets.includes(wallet))
      return res.status(403).json({ error: "ALREADY_MINTED" });

    const user = new PublicKey(wallet);

    const tokenAccounts =
      await connection.getParsedTokenAccountsByOwner(
        user,
        { mint: FUND_TOKEN_MINT }
      );

    const fundBalance = tokenAccounts.value.reduce(
      (sum, acc) =>
        sum + acc.account.data.parsed.info.tokenAmount.uiAmount,
      0
    );

    if (fundBalance < REQUIRED_FUND)
      return res.status(403).json({ error: "INSUFFICIENT_FUND" });

    const candyMachine = await metaplex
      .candyMachines()
      .findByAddress({ address: CANDY_MACHINE_ID });

    const mintBuilder = await metaplex
      .candyMachines()
      .builders()
      .mint({
        candyMachine,
        payer: user
      });

    const transaction = mintBuilder.toTransaction();
    transaction.feePayer = user;

    const { blockhash } =
      await connection.getLatestBlockhash();

    transaction.recentBlockhash = blockhash;

    transaction.partialSign(authority);

    const serialized = transaction.serialize({
      requireAllSignatures: false
    });

    mintedWallets.push(wallet);
    fs.writeFileSync(
      "./minted.json",
      JSON.stringify(mintedWallets, null, 2)
    );

    return res.json({
      tx: serialized.toString("base64")
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message || "MINT_FAILED"
    });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 FUNDOSHI backend running on port ${PORT}`);
});
