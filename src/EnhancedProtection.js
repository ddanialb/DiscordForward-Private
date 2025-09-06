class EnhancedProtection {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            await this.handleVoiceStateUpdate(oldState, newState);
        });
    }

    async handleVoiceStateUpdate(oldState, newState) {
        // Check if any protected user was affected by mute/deafen/move
        if (oldState.member && this.config.protectedUsers.includes(oldState.member.id)) {
            const protectedUser = oldState.member;
            
            // Check for mute/deafen changes while in voice
            if (oldState.channelId && newState.channelId) {
                // Check if muted
                if (!oldState.serverMute && newState.serverMute) {
                    console.log(`🚨 Protected user ${protectedUser.user.tag} was server muted!`);
                    await this.handleProtectedUserMuted(oldState, newState);
                }
                
                // Check if deafened
                if (!oldState.serverDeaf && newState.serverDeaf) {
                    console.log(`🚨 Protected user ${protectedUser.user.tag} was server deafened!`);
                    await this.handleProtectedUserDeafened(oldState, newState);
                }
                
                // Check if moved to different channel
                if (oldState.channelId !== newState.channelId) {
                    console.log(`🚨 Protected user ${protectedUser.user.tag} was moved from ${oldState.channel?.name} to ${newState.channel?.name}!`);
                    await this.handleProtectedUserMoved(oldState, newState);
                }
            }
        }
    }

    async handleProtectedUserMuted(oldState, newState) {
        try {
            const guild = oldState.guild;
            const protectedUserId = oldState.member.id;

            console.log(`🔍 Checking audit logs for MEMBER_UPDATE (mute) actions...`);
            
            const auditLogs = await guild.fetchAuditLogs({
                type: 'MEMBER_UPDATE',
                limit: 10
            });

            const muteLog = auditLogs.entries.find(entry => {
                const isRecentEnough = Date.now() - entry.createdTimestamp < 10000; // 10 second window
                const isTargetMatch = entry.target && entry.target.id === protectedUserId;
                const hasMuteChange = entry.changes?.some(change => change.key === 'mute');
                
                return isRecentEnough && isTargetMatch && hasMuteChange && entry.executor && !entry.executor.bot;
            });

            if (muteLog && muteLog.executor.id !== protectedUserId) {
                const executor = muteLog.executor;
                console.log(`🎯 CONFIRMED: ${executor.tag} muted protected user`);
                
                const member = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id);
                if (member && member.voice.channel) {
                    console.log(`🔇 Retaliating: Muting ${executor.tag} for muting protected user`);
                    await member.voice.setMute(true, `Muted protected user: ${oldState.member.user.tag}`);
                    console.log(`✅ Successfully muted ${executor.tag} in retaliation`);
                } else {
                    console.log(`⚠️ ${executor.tag} is not in voice channel, cannot retaliate`);
                }
            }
        } catch (error) {
            console.error('❌ Error handling protected user mute:', error.message);
        }
    }

    async handleProtectedUserDeafened(oldState, newState) {
        try {
            const guild = oldState.guild;
            const protectedUserId = oldState.member.id;

            console.log(`🔍 Checking audit logs for MEMBER_UPDATE (deafen) actions...`);
            
            const auditLogs = await guild.fetchAuditLogs({
                type: 'MEMBER_UPDATE',
                limit: 10
            });

            const deafenLog = auditLogs.entries.find(entry => {
                const isRecentEnough = Date.now() - entry.createdTimestamp < 10000; // 10 second window
                const isTargetMatch = entry.target && entry.target.id === protectedUserId;
                const hasDeafenChange = entry.changes?.some(change => change.key === 'deaf');
                
                return isRecentEnough && isTargetMatch && hasDeafenChange && entry.executor && !entry.executor.bot;
            });

            if (deafenLog && deafenLog.executor.id !== protectedUserId) {
                const executor = deafenLog.executor;
                console.log(`🎯 CONFIRMED: ${executor.tag} deafened protected user`);
                
                const member = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id);
                if (member && member.voice.channel) {
                    console.log(`🔇 Retaliating: Deafening ${executor.tag} for deafening protected user`);
                    await member.voice.setDeaf(true, `Deafened protected user: ${oldState.member.user.tag}`);
                    console.log(`✅ Successfully deafened ${executor.tag} in retaliation`);
                } else {
                    console.log(`⚠️ ${executor.tag} is not in voice channel, cannot retaliate`);
                }
            }
        } catch (error) {
            console.error('❌ Error handling protected user deafen:', error.message);
        }
    }

    async handleProtectedUserMoved(oldState, newState) {
        try {
            const guild = oldState.guild;
            const protectedUserId = oldState.member.id;

            console.log(`🔍 Checking audit logs for MEMBER_MOVE actions...`);
            
            const auditLogs = await guild.fetchAuditLogs({
                type: 'MEMBER_MOVE',
                limit: 10
            });

            const moveLog = auditLogs.entries.find(entry => {
                const isRecentEnough = Date.now() - entry.createdTimestamp < 10000; // 10 second window
                const isTargetMatch = entry.target && entry.target.id === protectedUserId;
                
                return isRecentEnough && isTargetMatch && entry.executor && !entry.executor.bot;
            });

            if (moveLog && moveLog.executor.id !== protectedUserId) {
                const executor = moveLog.executor;
                console.log(`🎯 CONFIRMED: ${executor.tag} moved protected user`);
                
                const member = guild.members.cache.get(executor.id) || await guild.members.fetch(executor.id);
                if (member && member.voice.channel) {
                    // Find a random voice channel in the same category as the original channel
                    const originalCategory = oldState.channel?.parent;
                    let randomChannel = await this.findRandomVoiceChannel(guild, originalCategory);
                    
                    if (randomChannel) {
                        console.log(`🎲 Moving ${executor.tag} to random channel: ${randomChannel.name}`);
                        await member.voice.setChannel(randomChannel, `Moved protected user: ${oldState.member.user.tag}`);
                        console.log(`✅ Successfully moved ${executor.tag} to ${randomChannel.name} in retaliation`);
                    } else {
                        console.log(`⚠️ No suitable random voice channel found, disconnecting ${executor.tag} instead`);
                        await member.voice.disconnect(`Moved protected user: ${oldState.member.user.tag}`);
                        console.log(`✅ Successfully disconnected ${executor.tag} as retaliation`);
                    }
                } else {
                    console.log(`⚠️ ${executor.tag} is not in voice channel, cannot retaliate`);
                }
            }
        } catch (error) {
            console.error('❌ Error handling protected user move:', error.message);
        }
    }

    async findRandomVoiceChannel(guild, preferredCategory = null) {
        try {
            // Get all voice channels
            let voiceChannels = guild.channels.cache.filter(channel => 
                channel.type === 'GUILD_VOICE' && 
                channel.members.size < (channel.userLimit || 99) // Handle unlimited channels
            );

            // First try to find channels in the same category
            if (preferredCategory) {
                const sameCategoryChannels = voiceChannels.filter(channel => 
                    channel.parentId === preferredCategory.id
                );
                if (sameCategoryChannels.size > 0) {
                    voiceChannels = sameCategoryChannels;
                }
            }

            // Convert to array and pick random
            const channelArray = Array.from(voiceChannels.values());
            if (channelArray.length > 0) {
                return channelArray[Math.floor(Math.random() * channelArray.length)];
            }

            return null;
        } catch (error) {
            console.error('❌ Error finding random voice channel:', error.message);
            return null;
        }
    }
}

module.exports = EnhancedProtection;