const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

class VoiceManager {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.voiceConnection = null;
        this.lastVoiceState = null;
        this.originalDisplayNames = new Map(); // Store original display names
        this.displayNameTimers = new Map(); // Store timers for display name reset
        this.movedUsers = new Set(); // Track users who were moved
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            await this.handleVoiceStateUpdate(oldState, newState);
        });

        this.client.once('ready', () => {
            if (this.config.voiceChannelId) {
                console.log('🎵 Voice channel ID provided - will maintain 24/7 voice presence');
                this.joinVoiceChannel();
            }
        });
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
            setTimeout(() => this.joinVoiceChannel(), 30000);
        }
    }

    async handleVoiceStateUpdate(oldState, newState) {
        // Check if bot was moved from designated voice channel
        if (newState.member && newState.member.id === this.client.user.id) {
            await this.handleBotVoiceChange(oldState, newState);
        }

        // Check for protected users being disconnected
        if (oldState.member && this.config.protectedUsers.includes(oldState.member.id)) {
            if (oldState.channelId && !newState.channelId) {
                console.log(`🚨 Protected user ${oldState.member.user.tag} was disconnected from voice channel!`);
                // Mark user as moved for display name change
                this.movedUsers.add(oldState.member.id);
                // Handle protection logic in ProtectionManager
            }
        }

        // Check if a moved user rejoined their voice channel
        if (newState.member && this.movedUsers.has(newState.member.id)) {
            if (newState.channelId === this.config.voiceChannelId) {
                console.log(`🔄 User ${newState.member.user.tag} rejoined their designated voice channel`);
                await this.handleUserRejoin(newState.member);
            }
        }
    }

    async handleBotVoiceChange(oldState, newState) {
        // If bot was moved from designated channel to another channel
        if (oldState.channelId === this.config.voiceChannelId && 
            newState.channelId && 
            newState.channelId !== this.config.voiceChannelId) {
            
            console.log(`🔄 Bot was moved from designated channel, returning in 3 seconds...`);
            
            // Wait 3 seconds then rejoin designated channel
            setTimeout(async () => {
                try {
                    await this.rejoinDesignatedChannel();
                } catch (error) {
                    console.error('❌ Failed to rejoin designated channel:', error.message);
                }
            }, 3000);
        }
    }

    async rejoinDesignatedChannel() {
        if (!this.config.voiceChannelId) return;

        try {
            const guild = this.client.guilds.cache.find(g => g.channels.cache.has(this.config.voiceChannelId));
            if (!guild) return;

            const voiceChannel = guild.channels.cache.get(this.config.voiceChannelId);
            if (!voiceChannel) return;

            // Disconnect from current voice connection
            if (this.voiceConnection) {
                this.voiceConnection.destroy();
            }

            // Rejoin designated channel
            await this.joinVoiceChannel();
            console.log('✅ Successfully returned to designated voice channel');
            
        } catch (error) {
            console.error('❌ Error rejoining designated channel:', error.message);
            // Retry after 10 seconds
            setTimeout(() => this.rejoinDesignatedChannel(), 10000);
        }
    }

    async handleUserRejoin(member) {
        try {
            // Store original display name if not already stored
            if (!this.originalDisplayNames.has(member.id)) {
                this.originalDisplayNames.set(member.id, member.displayName);
            }

            // Change display name to "Engadr Move Nade Pesar"
            await member.setNickname('Engadr Move Nade Pesar', 'User rejoined after being moved');
            console.log(`🏷️ Changed display name for ${member.user.tag} to "Engadr Move Nade Pesar"`);

            // Clear existing timer if any
            if (this.displayNameTimers.has(member.id)) {
                clearTimeout(this.displayNameTimers.get(member.id));
            }

            // Set timer to restore original name after 5 minutes
            const timer = setTimeout(async () => {
                try {
                    const originalName = this.originalDisplayNames.get(member.id);
                    await member.setNickname(originalName, 'Restoring original display name');
                    console.log(`🏷️ Restored original display name for ${member.user.tag}`);
                    
                    // Clean up
                    this.originalDisplayNames.delete(member.id);
                    this.displayNameTimers.delete(member.id);
                    this.movedUsers.delete(member.id);
                } catch (error) {
                    console.error(`❌ Failed to restore display name for ${member.user.tag}:`, error.message);
                }
            }, 5 * 60 * 1000); // 5 minutes

            this.displayNameTimers.set(member.id, timer);

        } catch (error) {
            console.error(`❌ Failed to change display name for ${member.user.tag}:`, error.message);
        }
    }
}

module.exports = VoiceManager;