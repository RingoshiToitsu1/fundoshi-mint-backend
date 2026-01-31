// ─────────────────────────────────────────────
// LOAD WHITELIST + MINT TRACKING (SAFE)
// ─────────────────────────────────────────────

const WHITELIST_FILE = "./whitelist.json";
const MINTED_FILE = "./minted.json";

// Ensure whitelist exists
if (!fs.existsSync(WHITELIST_FILE)) {
  console.error("❌ whitelist.json missing");
  process.exit(1);
}

// Load whitelist safely
const whitelist = fs
  .readFileSync(WHITELIST_FILE, "utf8")
  .split(/\r?\n/)
  .map(w => w.trim())
  .filter(Boolean);

console.log("✅ Whitelist loaded:", whitelist.length, "wallets");

// Ensure minted.json exists
if (!fs.existsSync(MINTED_FILE)) {
  fs.writeFileSync(MINTED_FILE, JSON.stringify([]));
}

// Helpers
const getMintedWallets = () => {
  const data = JSON.parse(fs.readFileSync(MINTED_FILE, "utf8"));
  return Array.isArray(data) ? data : [];
};

const markMinted = (wallet) => {
  const minted = getMintedWallets();
  if (!minted.includes(wallet)) {
    minted.push(wallet);
    fs.writeFileSync(MINTED_FILE, JSON.stringify(minted, null, 2));
  }
};
