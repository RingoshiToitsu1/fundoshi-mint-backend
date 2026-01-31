import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";

const RPC = "https://api.mainnet-beta.solana.com";
const OWNER = new PublicKey("DNwXiq3n7ZsQFBqYcx7Lxtikzn7ySzENBZxKM8C2Q6Sf");
const WALLET_PATH = `${process.env.HOME}/.config/solana/id.json`;

// load metadata map
const metadataMap = JSON.parse(
  fs.readFileSync("pinata-metadata/metadata-map.json", "utf8")
);

// load wallet
const secret = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

// setup
const connection = new Connection(RPC, "confirmed");
const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet));

(async () => {
  console.log("🔍 Fetching NFTs owned by wallet...");
  const nfts = await metaplex.nfts().findAllByOwner({ owner: OWNER });

  // build name → mint map
  const mintByIndex = {};
  for (const nft of nfts) {
    if (!nft.name) continue;
    const match = nft.name.match(/FUNDOSHI\s+#(\d+)/);
    if (!match) continue;

    const index = Number(match[1]) - 1;
    mintByIndex[index] = nft.mintAddress.toBase58();
  }

  for (const [index, metaCid] of Object.entries(metadataMap)) {
    const mint = mintByIndex[index];
    if (!mint) {
      console.error(`❌ Could not find mint for index ${index}`);
      continue;
    }

    const newUri = `https://gateway.pinata.cloud/ipfs/${metaCid}`;

    console.log(`\n🔁 Updating FUNDOSHI #${Number(index) + 1}`);
    console.log(`Mint: ${mint}`);
    console.log(`URI → ${newUri}`);

    await metaplex.nfts().update({
      mintAddress: new PublicKey(mint),
      uri: newUri,
    });

    console.log(`✅ Updated ${index}`);
  }

  console.log("\n🎉 ALL POSSIBLE METADATA URIs UPDATED");
})();
