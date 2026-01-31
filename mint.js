import fs from "fs";
import { PublicKey } from "@solana/web3.js";

const whitelist = JSON.parse(
  fs.readFileSync("./whitelist.json", "utf8")
).whitelist;

/**
 * Validate wallet is allowed to mint
 */
export function assertWhitelisted(wallet) {
  try {
    const pubkey = new PublicKey(wallet);
    if (!whitelist.includes(pubkey.toBase58())) {
      throw new Error("Wallet not whitelisted");
    }
  } catch (err) {
    throw new Error("Invalid or unauthorized wallet");
  }
}
