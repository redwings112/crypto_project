import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");

async function fetchBalance() {
    const publicKey = new PublicKey("YourPublicKeyHere");
    const balance = await connection.getBalance(publicKey);

    // Send to backend
    fetch("http://localhost:3000/fetch-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey.toBase58() })
    })
    .then(response => response.json())
    .then(data => console.log(data))
    .catch(error => console.error(error));
}

fetchBalance();
