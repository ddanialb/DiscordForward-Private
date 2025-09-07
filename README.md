# Discord Advanced Message Forwarder & Protection System

A comprehensive Discord selfbot featuring message forwarding, voice channel management, and advanced protection systems for users across multiple servers.

## 🚀 Features

### 📨 Message Forwarding

- ✅ Auto-forward messages from source channel to webhook
- ✅ Prevents infinite loops and self-message forwarding
- ✅ Simple text-based forwarding with webhook integration

### 🎵 Voice Channel Management

- ✅ 24/7 voice presence in designated channels
- ✅ Auto-rejoin when moved or disconnected
- ✅ Voice connection monitoring and recovery

### 🛡️ Advanced Protection Systems

- ✅ **Enhanced Voice Protection**: Monitors all servers for protected user violations
- ✅ **Mute Protection**: Retaliates when protected users are muted
- ✅ **Deafen Protection**: Retaliates when protected users are deafened
- ✅ **Move Protection**: Moves attackers to random channels
- ✅ **Disconnect Protection**: Punishes those who disconnect protected users
- ✅ **Display Name System**: Changes names of moved users and bot
- ✅ **Cross-Server Monitoring**: Works across ALL Discord servers

### 🔧 Technical Features

- ✅ Modular architecture with separate components
- ✅ Express server for hosting platforms (Replit, etc.)
- ✅ Comprehensive error handling and logging
- ✅ Audit log analysis for accurate targeting

## 📋 Requirements

- Node.js 16.0.0 or higher
- Discord account with valid token
- Webhook URL for message forwarding
- Bot permissions in target servers

## 🛠️ Installation & Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Create environment file:**

   ```bash
   cp .env.example .env
   ```

3. **Configure environment variables:**

   ```env
   DISCORD_TOKEN=your_discord_token_here
   SOURCE_CHANNEL_ID=channel_id_to_monitor
   WEBHOOK_URL=your_webhook_url_here
   VOICE_CHANNEL_ID=voice_channel_for_24_7_presence (optional)
   PROTECTED_USERS=user_id1,user_id2,user_id3 (comma-separated)
   ```

4. **Run the bot:**
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Required Variables

- `DISCORD_TOKEN`: Your Discord account token
- `SOURCE_CHANNEL_ID`: Channel ID to monitor for messages
- `WEBHOOK_URL`: Discord webhook URL for message forwarding

### Optional Variables

- `VOICE_CHANNEL_ID`: Voice channel for 24/7 presence
- `PROTECTED_USERS`: Comma-separated list of user IDs to protect

## 🏗️ Project Structure

```
├── src/
│   ├── bot.js                 # Main bot class and initialization
│   ├── MessageForwarder.js    # Handles message forwarding via webhooks
│   ├── VoiceManager.js        # Manages voice channel connections and auto-rejoin
│   ├── ProtectionManager.js   # Basic protection for user disconnections
│   └── EnhancedProtection.js  # Advanced protection system for mutes/deafens/moves
├── main.js                    # Entry point with Express server
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## 🎯 Usage

1. **Message Forwarding**: Messages from the source channel are automatically forwarded to the webhook URL
2. **Voice Protection**: The bot monitors voice activities and protects specified users
3. **Auto-Rejoin**: If moved from designated voice channel, bot automatically returns
4. **Cross-Server**: All protection features work across multiple Discord servers

## ⚠️ Important Notes

- This is a selfbot - use responsibly and in accordance with Discord's Terms of Service
- The bot requires appropriate permissions in servers where protection is active
- Voice protection features work best when the bot has voice management permissions
- Display name changes are temporary (5 minutes) and automatically restore

## 🔧 Scripts

- `npm start` - Start the bot
- `npm run dev` - Development mode (same as start)
- `npm test` - Run tests (placeholder)
