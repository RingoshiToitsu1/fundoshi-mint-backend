import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

const RPC = "https://api.mainnet-beta.solana.com";
const WALLET_PATH = `${process.env.HOME}/.config/solana/id.json`;

// load files
const cache = JSON.parse(fs.readFileSync("cache.json", "utf8"));
const metadataMap = JSON.parse(
  fs.readFileSync("pinata-metadata/metadata-map.json", "utf8")
);

// load wallet
const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

// setup metaplex
const connection = new Connection(RPC, "confirmed");
const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet));

(async () => {
  for (const [index, metaCid] of Object.entries(metadataMap)) {
    const item = cache.items[index];

    if (!item || !item.mint) {
      console.error(`❌ Missing mint for index ${index}`);
      continue;
    }

    const mintAddress = new PublicKey(item.mint);
    const newUri = `https://gateway.pinata.cloud/ipfs/${metaCid}`;

    console.log(`\n🔁 Updating index ${index}`);
    console.log(`Mint: ${mintAddress.toBase58()}`);
    console.log(`URI → ${newUri}`);

    await metaplex.nfts().update({
      mintAddress,
      uri: newUri,
    });

    console.log(`✅ Updated ${index}`);
  }

  console.log("\n🎉 ALL METADATA URIs UPDATED TO PINATA");
})();
