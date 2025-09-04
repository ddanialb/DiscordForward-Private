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
            
            let disconnectLog = null;
            
            // Only check MEMBER_DISCONNECT actions - this is what we need
            try {
                console.log(`🔍 Searching for MEMBER_DISCONNECT actions...`);
                
                const auditLogs = await guild.fetchAuditLogs({
                    type: 'MEMBER_DISCONNECT',
                    limit: 20
                });
                
                console.log(`📋 Found ${auditLogs.entries.size} MEMBER_DISCONNECT entries`);
                
                // Show all recent MEMBER_DISCONNECT entries
                const recentDisconnects = [];
                auditLogs.entries.forEach(entry => {
                    const timeDiff = Date.now() - entry.createdTimestamp;
                    if (timeDiff < 15000) { // Only check very recent ones (15 seconds)
                        const targetName = entry.target?.tag || 'undefined';
                        console.log(`✅ Found MEMBER_DISCONNECT: ${entry.executor?.tag || 'Unknown'} disconnected ${targetName} from voice (${Math.floor(timeDiff/1000)}s ago)`);
                        
                        // If target is undefined but timing matches our disconnect, this could be us
                        if (entry.executor && entry.executor.id && timeDiff < 10000) {
                            recentDisconnects.push({
                                executor: entry.executor,
                                target: entry.target,
                                timestamp: entry.createdTimestamp,
                                timeDiff: timeDiff
                            });
                        }
                    }
                });
                
                // Filter for disconnects that match our protected user OR recent undefined targets
                const disconnectLogs = auditLogs.entries.filter(entry => {
                    const isRecentEnough = Date.now() - entry.createdTimestamp < 15000; // 15 second window
                    const hasExecutor = entry.executor && entry.executor.id;
                    
                    if (!isRecentEnough || !hasExecutor) return false;
                    
                    // Direct match with our protected user ID
                    const isDirectTargetMatch = entry.target && entry.target.id === protectedUserId;
                    
                    // OR if target is undefined/null but timing is very recent (likely us)
                    const isLikelyOurDisconnect = (!entry.target || !entry.target.id) && 
                                                  Date.now() - entry.createdTimestamp < 10000;
                    
                    if (isDirectTargetMatch) {
                        console.log(`🎯 Direct match: ${entry.executor.tag} disconnected protected user`);
                        return true;
                    } else if (isLikelyOurDisconnect) {
                        console.log(`🎯 Timing match: ${entry.executor.tag} disconnected someone (likely protected user) ${Math.floor((Date.now() - entry.createdTimestamp)/1000)}s ago`);
                        console.log(`✅ ACCEPTING ${entry.executor.tag} as disconnector based on timing!`);
                        return true;
                    }
                    
                    return false;
                });
                
                if (disconnectLogs.length > 0) {
                    // Get the FIRST (most recent) disconnect action - this is our target
                    const sortedLogs = disconnectLogs.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                    disconnectLog = sortedLogs[0]; // Take the first/latest one
                    
                    console.log(`🎯 TARGET IDENTIFIED: ${disconnectLog.executor.tag} (${disconnectLog.executor.id})`);
                    console.log(`⏰ Action timestamp: ${new Date(disconnectLog.createdTimestamp).toLocaleString()}`);
                }
                
                // If still no disconnectLog found, take the most recent MEMBER_DISCONNECT entry
                if (!disconnectLog && auditLogs.entries.size > 0) {
                    const mostRecentEntry = auditLogs.entries.first(); // Most recent entry
                    if (mostRecentEntry && mostRecentEntry.executor && 
                        Date.now() - mostRecentEntry.createdTimestamp < 15000) {
                        disconnectLog = mostRecentEntry;
                        console.log(`🎯 USING MOST RECENT: ${disconnectLog.executor.tag} (${disconnectLog.executor.id}) - latest MEMBER_DISCONNECT`);
                    }
                }
            } catch (error) {
                console.error(`❌ Error fetching MEMBER_DISCONNECT audit logs:`, error.message);
            }

            if (disconnectLog && disconnectLog.executor && disconnectLog.executor.id) {
                const executor = disconnectLog.executor;
                console.log(`🎯 CONFIRMED: ${executor.tag} (${executor.id}) disconnected protected user in ${guild.name}`);
                
                // Skip if the executor is the protected user themselves (self-disconnect)
                if (executor.id === protectedUserId) {
                    console.log('ℹ️ Protected user disconnected themselves - no punishment needed');
                    return;
                }
                
                // Skip if the executor is a bot
                if (executor.bot) {
                    console.log('ℹ️ Executor is a bot - no punishment needed');
                    return;
                }
                
                // Try to get the member object
                let member = guild.members.cache.get(executor.id);
                if (!member) {
                    try {
                        member = await guild.members.fetch(executor.id);
                    } catch (error) {
                        console.log(`⚠️ Could not fetch member ${executor.tag} - they may have left the server`);
                        return;
                    }
                }
                
                // Always punish anyone who disconnects protected user, regardless of roles
                console.log(`⚖️ Taking action against ${executor.tag} for disconnecting protected user...`);
                await this.punishUser(member, `Disconnected protected user: ${oldState.member.user.tag}`);
            } else {
                console.log('⚠️ Could not identify who disconnected the protected user via audit logs');
                console.log('ℹ️ No action taken - must find exact disconnector in audit logs');
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

    // Removed checkSuspiciousUsersInVoice method - only use audit logs for detection

    async punishUser(member, reason) {
        try {
            console.log(`🛡️ Starting punishment process for ${member.user.tag}...`);
            
            if (member.voice.channel) {
                console.log(`🎯 ${member.user.tag} is in voice channel: ${member.voice.channel.name}`);
                
                // Step 1: First mute the user
                console.log(`🔇 Step 1: Muting ${member.user.tag}...`);
                await member.voice.setMute(true, reason);
                console.log(`✅ Successfully voice muted ${member.user.tag}`);
                
                // Wait a moment before disconnect
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Step 2: Then disconnect them from voice
                console.log(`⚡ Step 2: Disconnecting ${member.user.tag}...`);
                await member.voice.disconnect(reason);
                console.log(`✅ Successfully disconnected ${member.user.tag} from voice channel`);
                
                console.log(`🎉 Punishment completed for ${member.user.tag}!`);
            } else {
                console.log(`⚠️ ${member.user.tag} is not in voice channel, cannot punish`);
            }
            
        } catch (error) {
            console.error(`❌ Failed to punish ${member.user.tag}:`, error.message);
            console.error('Error details:', error);
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