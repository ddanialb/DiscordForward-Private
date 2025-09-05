class ProtectionManager {
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
            
            try {
                console.log(`🔍 Searching for MEMBER_DISCONNECT actions...`);
                
                const auditLogs = await guild.fetchAuditLogs({
                    type: 'MEMBER_DISCONNECT',
                    limit: 20
                });
                
                console.log(`📋 Found ${auditLogs.entries.size} MEMBER_DISCONNECT entries`);
                
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
                        return true;
                    }
                    
                    return false;
                });
                
                if (disconnectLogs.length > 0) {
                    // Get the FIRST (most recent) disconnect action
                    const sortedLogs = disconnectLogs.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
                    disconnectLog = sortedLogs[0];
                    
                    console.log(`🎯 TARGET IDENTIFIED: ${disconnectLog.executor.tag} (${disconnectLog.executor.id})`);
                }
                
                // If still no disconnectLog found, take the most recent MEMBER_DISCONNECT entry
                if (!disconnectLog && auditLogs.entries.size > 0) {
                    const mostRecentEntry = auditLogs.entries.first();
                    if (mostRecentEntry && mostRecentEntry.executor && 
                        Date.now() - mostRecentEntry.createdTimestamp < 15000) {
                        disconnectLog = mostRecentEntry;
                        console.log(`🎯 USING MOST RECENT: ${disconnectLog.executor.tag} (${disconnectLog.executor.id})`);
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
                
                // Always punish anyone who disconnects protected user
                console.log(`⚖️ Taking action against ${executor.tag} for disconnecting protected user...`);
                await this.punishUser(member, `Disconnected protected user: ${oldState.member.user.tag}`);
            } else {
                console.log('⚠️ Could not identify who disconnected the protected user via audit logs');
            }

        } catch (error) {
            console.error('❌ Error in protection system:', error.message);
        }
    }

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
        }
    }
}

module.exports = ProtectionManager;