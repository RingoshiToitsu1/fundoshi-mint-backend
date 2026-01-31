import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

const RPC = "https://api.mainnet-beta.solana.com";
const WALLET_PATH = `${process.env.HOME}/.config/solana/id.json`;

// CONFIRMED VALUES
const MINT = new PublicKey("Cqw5mzWLNAT89n8Bim3ojMUf8cmZDEC7ttLnspN39cHc");
const NEW_URI =
  "https://gateway.pinata.cloud/ipfs/QmVSKCtnEW5UrU44WEi7LrRp3GWGuv7zWKHU5FjixdUfGG";

// load wallet
const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

// setup
const connection = new Connection(RPC, "confirmed");
const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet));

(async () => {
  console.log("🔍 Fetching NFT...");
  const nft = await metaplex.nfts().findByMint({ mintAddress: MINT });

  console.log("🔁 Updating NFT metadata URI");
  console.log("Mint:", MINT.toBase58());
  console.log("URI:", NEW_URI);

  await metaplex.nfts().update({
    nftOrSft: nft,
    uri: NEW_URI,
  });

  console.log("✅ Metadata updated on-chain");
})();
