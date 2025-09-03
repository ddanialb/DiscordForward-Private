# Discord Message Forwarder

Personal Discord bot for forwarding messages between channels

## Installation & Setup

1. **Copy configuration:**
 cp .env.example .env

2. **Set environment variables:**
- DISCORD_TOKEN: Your Discord account token
- SOURCE_CHANNEL_ID: ID of the source channel
- DESTINATION_CHANNEL_ID: ID of the destination channel

3. **Run the bot:**
    npm start

## Features

- ✅ Auto-forward messages
- ✅ Supports files and images
- ✅ Prevents infinite loops
- ✅ Clean and organized code

## Project Structure

├── src/
│   └── bot.js          # Main bot class
├── main.js             # Entry file
├── .env.example        # Configuration template
└── package.json        # Dependencies
