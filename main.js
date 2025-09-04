#!/usr/bin/env node

const DiscordForwarder = require("./src/bot");
const express = require("express");

console.log("🚀 Starting Discord Message Forwarder...\n");

// Create and start the forwarder
new DiscordForwarder();

// ==================== Express server for Replit ====================
const app = express();
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("✅ Discord Forwarder is running");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`🌐 Express server listening on 0.0.0.0:${port}`);
});
