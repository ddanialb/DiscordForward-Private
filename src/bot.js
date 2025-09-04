const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
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
        this.voiceConnection = null;
        this.lastVoiceState = null;
        
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
        
        console.log('🛡️ Universal voice protection enabled for all servers');
    }

    setupEventListeners() {
        this.client.once('ready', () => {
            console.log(`✅ Selfbot connected as: ${this.client.user.tag}`);
            console.log(`📡 Monitoring channel: ${this.config.sourceChannelId}`);
            console.log(`📤 Forwarding to channel: ${this.config.destinationChannelId}`);
            console.log(`🛡️ Universal protection enabled for users: ${this.config.protectedUsers.join(', ')}`);
            console.log(`🌍 Monitoring voice disconnections across ALL servers and channels`);
            if (this.config.voiceChannelId) {
                console.log(`🎵 Voice channel: ${this.config.voiceChannelId}`);
                this.joinVoiceChannel();
            }
            console.log('🔄 Ready to forward messages and protect voice channels across all servers...\n');
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });

        this.client.on('error', (error) => {
            console.error('❌ Discord client error:', error.message);
        });

        // Protection system - monitor voice state changes
        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            await this.handleVoiceStateUpdate(oldState, newState);
        });
    }

    async handleMessage(message) {
        // Skip own messages to prevent loops
        if (message.author.id === this.client.user.id) return;
        
        // Only process messages from source channel
        if (message.channel.id !== this.config.sourceChannelId) return;

        try {
            const destinationChannel = this.client.channels.cache.get(this.config.destinationChannelId);
            
            if (!destinationChannel) {
                console.error('❌ Destination channel not found!');
                return;
            }

            const forwardData = {
                content: message.content,
                files: message.attachments.map(attachment => attachment.url)
            };

            await destinationChannel.send(forwardData);
            console.log(`✅ Message forwarded: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`);
            
        } catch (error) {
            console.error('❌ Error forwarding message:', error.message);
        }
    }

    async joinVoiceChannel() {
        if (!this.config.voiceChannelId) return;
        
        try {
            const guild = this.client.guilds.cache.find(g => g.channels.cache.has(this.config.voiceChannelId));
            if (!guild) {
                console.error('❌ Could not find guild for voice channel');
                return;
            }

            const voiceChannel = guild.channels.cache.get(this.config.voiceChannelId);
            if (!voiceChannel || voiceChannel.type !== 'GUILD_VOICE') {
                console.error('❌ Voice channel not found or is not a voice channel');
                return;
            }

            this.voiceConnection = joinVoiceChannel({
                channelId: this.config.voiceChannelId,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
            });

            this.voiceConnection.on(VoiceConnectionStatus.Ready, () => {
                console.log('✅ Successfully connected to voice channel for 24/7 presence');
            });

            this.voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(this.voiceConnection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    console.log('🔄 Voice connection lost, attempting to reconnect...');
                    setTimeout(() => this.joinVoiceChannel(), 5000);
                }
            });

        } catch (error) {
            console.error('❌ Failed to join voice channel:', error.message);
            // Retry after 30 seconds
            setTimeout(() => this.joinVoiceChannel(), 30000);
        }
    }

    async handleVoiceStateUpdate(oldState, newState) {
        // Check if any protected user was disconnected from voice channel
        if (oldState.member && this.config.protectedUsers.includes(oldState.member.id)) {
            // If they were in a voice channel and now they're not (got disconnected)
            if (oldState.channelId && !newState.channelId) {
                console.log(`🚨 Protected user ${oldState.member.user.tag} was disconnected from voice channel!`);
                await this.handleProtectedUserDisconnected(oldState);
            }
        }
    }

    async handleProtectedUserDisconnected(oldState) {
        try {
            const guild = oldState.guild;
            const voiceChannel = oldState.channel;
            const protectedUserId = oldState.member.id;

            // Get audit logs to see who disconnected the protected user
            console.log(`🔍 Checking audit logs for user ${protectedUserId} in ${guild.name}...`);
            
            const auditLogs = await guild.fetchAuditLogs({
                limit: 10
            });

            console.log(`📋 Found ${auditLogs.entries.size} audit log entries`);
            
            // First, prioritize MEMBER_DISCONNECT actions as they are most specific
            let disconnectLog = null;
            
            // Step 1: Look specifically for MEMBER_DISCONNECT actions first (highest priority)
            const memberDisconnectLogs = auditLogs.entries.filter(entry => 
                entry.action === 'MEMBER_DISCONNECT' &&
                entry.target && 
                entry.target.id === protectedUserId && 
                Date.now() - entry.createdTimestamp < 15000 // 15 seconds window
            );
            
            if (memberDisconnectLogs.length > 0) {
                // Sort by timestamp to get the ABSOLUTE LATEST disconnect action
                const sortedDisconnectLogs = memberDisconnectLogs.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                disconnectLog = sortedDisconnectLogs[0];
                console.log(`🎯 Found LATEST MEMBER_DISCONNECT by ${disconnectLog.executor?.tag || 'Unknown'} at ${new Date(disconnectLog.createdTimestamp).toLocaleTimeString()}`);
            } else {
                // Step 2: If no MEMBER_DISCONNECT found, check other actions
                const otherActions = ['MEMBER_MOVE', 'MEMBER_UPDATE'];
                for (const actionType of otherActions) {
                    const logs = auditLogs.entries.filter(entry => 
                        entry.action === actionType &&
                        entry.target && 
                        entry.target.id === protectedUserId && 
                        Date.now() - entry.createdTimestamp < 10000
                    );
                    
                    if (logs.length > 0) {
                        const sortedLogs = logs.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                        disconnectLog = sortedLogs[0];
                        console.log(`🎯 Found RECENT ${actionType} action by ${disconnectLog.executor?.tag || 'Unknown'}`);
                        break;
                    }
                }
            }
            
            // If still not found, try broader search but still get the most recent
            if (!disconnectLog) {
                const recentLogs = auditLogs.entries.filter(entry => 
                    entry.target && 
                    entry.target.id === protectedUserId && 
                    Date.now() - entry.createdTimestamp < 10000 // Also reduced to 10 seconds
                ).sort((a, b) => b.createdTimestamp - a.createdTimestamp); // Sort by most recent
                
                if (recentLogs.length > 0) {
                    disconnectLog = recentLogs[0]; // Most recent action
                    console.log(`🔎 Found most recent action: ${disconnectLog.action} by ${disconnectLog.executor?.tag || 'Unknown'}`);
                }
            }

            if (disconnectLog && disconnectLog.executor && disconnectLog.executor.id) {
                const executor = disconnectLog.executor;
                console.log(`🔍 Found who disconnected protected user: ${executor.tag} (${executor.id}) in ${guild.name}`);
                
                // Check if they have any role in the server
                const member = guild.members.cache.get(executor.id);
                if (member && await this.hasAnyRole(member)) {
                    console.log(`⚖️ ${executor.tag} has roles in server - taking action...`);
                    
                    // Only mute the user (no disconnect)
                    await this.punishUser(member, 'Disconnected protected user');
                } else {
                    console.log(`ℹ️ ${executor.tag} has no roles in server - no action taken`);
                }
            } else {
                console.log('ℹ️ Could not find who disconnected the protected user via audit logs');
                console.log('🔍 Checking all voice channels for users with roles...');
                
                // Alternative approach: Check all users currently in voice channels with roles
                await this.checkSuspiciousUsersInVoice(guild, oldState.channel);
            }

            // Try to reconnect to voice channel if it's the main protected user
            if (protectedUserId === this.config.protectedUsers[0] && this.config.voiceChannelId) {
                setTimeout(() => {
                    console.log('🔄 Attempting to reconnect to voice channel...');
                    this.joinVoiceChannel();
                }, 5000);
            }

        } catch (error) {
            console.error('❌ Error in protection system:', error.message);
        }
    }

    async hasAnyRole(member) {
        try {
            // Check if member has any roles (excluding @everyone) or important permissions
            return member.roles.cache.size > 1 || // Has roles other than @everyone
                   member.permissions.has('ADMINISTRATOR') || 
                   member.permissions.has('MANAGE_CHANNELS') ||
                   member.permissions.has('MANAGE_GUILD') ||
                   member.permissions.has('MANAGE_MESSAGES') ||
                   member.permissions.has('KICK_MEMBERS') ||
                   member.permissions.has('BAN_MEMBERS') ||
                   member.permissions.has('MUTE_MEMBERS') ||
                   member.permissions.has('DEAFEN_MEMBERS');
        } catch (error) {
            console.error('❌ Error checking permissions:', error.message);
            return false;
        }
    }

    async checkSuspiciousUsersInVoice(guild, originalVoiceChannel) {
        try {
            // Get all voice channels in the guild
            const voiceChannels = guild.channels.cache.filter(channel => 
                channel.type === 'GUILD_VOICE' && channel.members.size > 0
            );
            
            console.log(`🔍 Checking ${voiceChannels.size} voice channels for suspicious users...`);
            
            for (const [channelId, channel] of voiceChannels) {
                for (const [memberId, member] of channel.members) {
                    // Skip bots and the protected users
                    if (member.user.bot || this.config.protectedUsers.includes(member.id)) continue;
                    
                    // Check if this user has roles and could have disconnected someone
                    if (await this.hasAnyRole(member)) {
                        console.log(`🎯 Found user with roles in voice: ${member.user.tag} in ${channel.name}`);
                        console.log(`⚖️ Taking preventive action against ${member.user.tag}...`);
                        
                        // Only mute this user as they could be the one who disconnected
                        await this.punishUser(member, 'Suspicious activity: May have disconnected protected user');
                        
                        // Only punish the first suspicious user found to avoid mass punishment
                        return;
                    }
                }
            }
            
            console.log('ℹ️ No suspicious users with roles found in voice channels');
            
        } catch (error) {
            console.error('❌ Error checking suspicious users:', error.message);
        }
    }

    async punishUser(member, reason) {
        try {
            if (member.voice.channel) {
                // Step 1: First mute the user
                await member.voice.setMute(true, reason);
                console.log(`🔇 Successfully voice muted ${member.user.tag}`);
                
                // Step 2: Then disconnect them from voice
                await member.voice.disconnect(reason);
                console.log(`⚡ Successfully disconnected ${member.user.tag} from voice channel`);
            } else {
                console.log(`⚠️ ${member.user.tag} is not in voice channel, cannot punish`);
            }
            
        } catch (error) {
            console.error(`❌ Failed to punish ${member.user.tag}:`, error.message);
        }
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