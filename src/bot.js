const { Client } = require('discord.js-selfbot-v13');
const MessageForwarder = require('./MessageForwarder');
const VoiceManager = require('./VoiceManager');
const ProtectionManager = require('./ProtectionManager');
const EnhancedProtection = require('./EnhancedProtection');
require('dotenv').config();

class DiscordForwarder {
    constructor() {
        this.client = new Client({ checkUpdate: false });
        this.config = {
            token: process.env.DISCORD_TOKEN,
            sourceChannelId: process.env.SOURCE_CHANNEL_ID,
            destinationChannelId: process.env.DESTINATION_CHANNEL_ID,
            voiceChannelId: process.env.VOICE_CHANNEL_ID,
            protectedUsers: process.env.PROTECTED_USERS ? process.env.PROTECTED_USERS.split(',').map(id => id.trim()) : ['941507108233416735']
        };
        
        // Initialize modules
        this.messageForwarder = new MessageForwarder(this.client, this.config);
        this.voiceManager = new VoiceManager(this.client, this.config);
        this.protectionManager = new ProtectionManager(this.client, this.config);
        this.enhancedProtection = new EnhancedProtection(this.client, this.config);
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.validateConfig();
        this.login();
    }

    validateConfig() {
        const required = ['token', 'sourceChannelId', 'destinationChannelId'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
            process.exit(1);
        }
        
        if (this.config.voiceChannelId) {
            console.log('🎵 Voice channel ID provided - will maintain 24/7 voice presence');
        }
        
        console.log('🛡️ Enhanced voice protection system enabled for all servers');
    }

    setupEventListeners() {
        this.client.once('ready', () => {
            console.log(`✅ Selfbot connected as: ${this.client.user.tag}`);
            console.log(`📡 Monitoring channel: ${this.config.sourceChannelId}`);
            console.log(`📤 Forwarding to channel: ${this.config.destinationChannelId}`);
            console.log(`🛡️ Enhanced protection enabled for users: ${this.config.protectedUsers.join(', ')}`);
            console.log(`🌍 Monitoring voice activities across ALL servers and channels:`);
            console.log(`   🔇 Mute protection - Retaliates when protected users are muted`);
            console.log(`   🔊 Deafen protection - Retaliates when protected users are deafened`);
            console.log(`   🎯 Move protection - Moves attackers to random channels`);
            console.log(`   ⚡ Disconnect protection - Punishes those who disconnect protected users`);
            if (this.config.voiceChannelId) {
                console.log(`🎵 Voice channel: ${this.config.voiceChannelId}`);
                console.log(`🔄 Auto-rejoin enabled - bot will return to designated voice channel if moved`);
                console.log(`🏷️ Display name change system enabled for moved users`);
            }
            console.log('🔄 Ready to forward messages and provide enhanced voice protection across all servers...\n');
        });

        this.client.on('error', (error) => {
            console.error('❌ Discord client error:', error.message);
        });
    }

    async login() {
        try {
            await this.client.login(this.config.token);
        } catch (error) {
            console.error('❌ Failed to login:', error.message);
            console.error('💡 Make sure your Discord token is valid and properly set in environment variables');
            process.exit(1);
        }
    }
}

module.exports = DiscordForwarder;