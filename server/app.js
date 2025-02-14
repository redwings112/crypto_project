const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const fileUpload = require("express-fileupload");
const router = require("./routes");
const cors = require("cors");
const mongoose = require("mongoose");
const { Connection, PublicKey } = require("@solana/web3.js");


require("dotenv").config();
const app = express();

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const userSchema = new mongoose.Schema({
    address: String,
    balance: Number
});
const User = mongoose.model("User", userSchema);

// Solana Connection
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
const connection = new Connection(SOLANA_RPC_URL);

// Fetch User Balance
app.post("/fetch-balance", async (req, res) => {
    try {
        const { address } = req.body;
        const publicKey = new PublicKey(address);
        const balance = await connection.getBalance(publicKey);

        // Store in MongoDB
        const user = await User.findOneAndUpdate(
            { address },
            { balance },
            { upsert: true, new: true }
        );

        res.json({ address, balance });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// config
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: "server/config/config.env" });
}
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(router);
app.use(cors());
__dirname = path.resolve();
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "/frontend/build")));

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "frontend", "build", "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("Server is Running! 🚀");
  });
}

module.exports = app;
