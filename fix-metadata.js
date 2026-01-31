import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import fs from "fs";

const connection = new Connection("https://api.mainnet-beta.solana.com");

const keypair = Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(process.env.HOME + "/.config/solana/id.json")
    )
  )
);

const metaplex = Metaplex.make(connection).use(
  keypairIdentity(keypair)
);

const NFT_MINT = new PublicKey(
  "Cqw5mzWLNAT89n8Bim3ojMUf8cmZDEC7ttLnspN39cHc"
);

const NEW_METADATA_URI =
  "https://arweave.net/J2qAE1VyeFMYWcHoxF10vIr0XQ79j-yxmwiMn3QQHSA";

(async () => {
  // 🔹 Fetch the existing NFT first
  const nft = await metaplex.nfts().findByMint({ mintAddress: NFT_MINT });

  // 🔹 Update ONLY the URI, preserve everything else
  await metaplex.nfts().update({
    nftOrSft: nft,
    uri: NEW_METADATA_URI,
  });

  console.log("✅ Metadata updated on-chain");
})();
