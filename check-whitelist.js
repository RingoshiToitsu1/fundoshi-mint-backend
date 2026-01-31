import fs from "fs";

const whitelist = JSON.parse(
  fs.readFileSync("./whitelist.json", "utf8")
).whitelist;

const wallet = process.argv[2];

if (!wallet) {
  console.log("Usage: node check-whitelist.js <WALLET_ADDRESS>");
  process.exit(1);
}

if (whitelist.includes(wallet)) {
  console.log("✅ Wallet is whitelisted");
} else {
  console.log("❌ Wallet is NOT whitelisted");
}
