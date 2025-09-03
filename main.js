#!/usr/bin/env node

const DiscordForwarder = require("./src/bot");
const express = require("express");

console.log("🚀 Starting Discord Message Forwarder...\n");

// Create and start the forwarder
new DiscordForwarder();

// ==================== Express server برای Render ====================
const app = express();
const port = process.env.PORT || 4000;

app.get("/", (req, res) => {
  res.send("✅ Discord Forwarder is running");
});

app.listen(port, () => {
  console.log(`🌐 Express server listening on port ${port}`);
});
