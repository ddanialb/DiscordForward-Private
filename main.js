#!/usr/bin/env node

const DiscordForwarder = require('./src/bot');

console.log('🚀 Starting Discord Message Forwarder...\n');

// Create and start the forwarder
new DiscordForwarder();