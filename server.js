import express from "express";
import fs from "fs";
import cors from "cors";
import { Connection, PublicKey } from "@solana/web3.js";

const app = express();
const PORT = process.env.PORT || 3000;

const RPC_URL = "https://api.mainnet-beta.solana.com";
const CANDY_MACHINE_ID = new PublicKey(
  "3pzu8qm6Hw65VH1khEtoU3ZPi8AtGn92oyjuUvVswArJ"
);

const WHITELIST_FILE = "./whitelist.json";
const MINTED_FILE = "./minted.json";

const whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf8"));

if (!fs.existsSync(MINTED_FILE)) {
  fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
}

const getMinted = () =>
  JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));

const markMinted = (wallet) => {
  const minted = getMinted();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
  }
};

app.use(cors({ origin: "*", methods: ["POST", "OPTIONS"] }));
app.use(express.json());

app.post("/mint/check", async (req, res) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.json({ eligible: false, reason: "NO_WALLET" });

    if (!whitelist.includes(wallet)) {
      return res.json({ eligible: false, reason: "NOT_WHITELISTED" });
    }

    if (getMinted().includes(wallet)) {
      return res.json({ eligible: false, reason: "ALREADY_MINTED" });
    }

    const connection = new Connection(RPC_URL);
    const candyMachineAccount = await connection.getAccountInfo(
      CANDY_MACHINE_ID
    );

    if (!candyMachineAccount) {
      return res.json({ eligible: false, reason: "CM_NOT_FOUND" });
    }

    return res.json({ eligible: true });
  } catch (err) {
    console.error(err);
    return res.json({ eligible: false, reason: "INTERNAL_ERROR" });
  }
});

app.post("/mint/record", (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "Wallet required" });

  markMinted(wallet);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
