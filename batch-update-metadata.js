import fs from "fs";
import { Connection, Keypair } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

const RPC = "https://api.mainnet-beta.solana.com";
const WALLET_PATH = `${process.env.HOME}/.config/solana/id.json`;
const METADATA_MAP = "pinata-metadata/metadata-map.json";

// load wallet
const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

// setup
const connection = new Connection(RPC);
const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet));

// load metadata hashes
const metadataMap = JSON.parse(fs.readFileSync(METADATA_MAP, "utf8"));

// load cache.json to get mint addresses
const cache = JSON.parse(fs.readFileSync("cache.json", "utf8"));

(async () => {
  for (const [index, metaHash] of Object.entries(metadataMap)) {
    const item = cache.items[index];
    if (!item || !item.mint) {
      console.error(`Missing mint for index ${index}`);
      continue;
    }

    const mintAddress = item.mint;
    const newUri = `https://gateway.pinata.cloud/ipfs/${metaHash}`;

    console.log(`Updating NFT ${index} → ${mintAddress}`);
    console.log(`URI: ${newUri}`);

    await metaplex.nfts().update({
      mintAddress,
      uri: newUri,
    });

    console.log(`✅ Updated ${index}`);
  }

  console.log("🎉 ALL 25 NFTs UPDATED");
})();
