class EnhancedProtection {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.client.on("voiceStateUpdate", async (oldState, newState) => {
      await this.handleVoiceStateUpdate(oldState, newState);
    });
  }

  async handleVoiceStateUpdate(oldState, newState) {
    // Check if any protected user was affected by mute/deafen/move
    if (
      oldState.member &&
      this.config.protectedUsers.includes(oldState.member.id)
    ) {
      const protectedUser = oldState.member;

      // Check for mute/deafen changes while in voice
      if (oldState.channelId && newState.channelId) {
        // Check if muted
        if (!oldState.serverMute && newState.serverMute) {
          console.log(
            `🚨 Protected user ${protectedUser.user.tag} was server muted!`
          );
          await this.handleProtectedUserMuted(oldState, newState);
        }

        // Check if deafened
        if (!oldState.serverDeaf && newState.serverDeaf) {
          console.log(
            `🚨 Protected user ${protectedUser.user.tag} was server deafened!`
          );
          await this.handleProtectedUserDeafened(oldState, newState);
        }

        // Check if moved to different channel
        if (oldState.channelId !== newState.channelId) {
          console.log(
            `🚨 Protected user ${protectedUser.user.tag} was moved from ${oldState.channel?.name} to ${newState.channel?.name}!`
          );
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
        type: "MEMBER_UPDATE",
        limit: 10,
      });

      const muteLog = auditLogs.entries.find((entry) => {
        const isRecentEnough = Date.now() - entry.createdTimestamp < 10000;
        const isTargetMatch =
          entry.target && entry.target.id === protectedUserId;
        const hasMuteChange = entry.changes?.some(
          (change) => change.key === "mute"
        );

        return (
          isRecentEnough &&
          isTargetMatch &&
          hasMuteChange &&
          entry.executor &&
          !entry.executor.bot
        );
      });

      if (muteLog && muteLog.executor.id !== protectedUserId) {
        const executor = muteLog.executor;
        console.log(`🎯 CONFIRMED: ${executor.tag} muted protected user`);

        // Try to find and punish the executor in any voice channel across all servers
        await this.findAndPunishUser(
          executor.id,
          "mute",
          oldState.member.user.tag
        );
      }
    } catch (error) {
      console.error("❌ Error handling protected user mute:", error.message);
    }
  }

  async handleProtectedUserDeafened(oldState, newState) {
    try {
      const guild = oldState.guild;
      const protectedUserId = oldState.member.id;

      console.log(
        `🔍 Checking audit logs for MEMBER_UPDATE (deafen) actions...`
      );

      const auditLogs = await guild.fetchAuditLogs({
        type: "MEMBER_UPDATE",
        limit: 10,
      });

      const deafenLog = auditLogs.entries.find((entry) => {
        const isRecentEnough = Date.now() - entry.createdTimestamp < 10000;
        const isTargetMatch =
          entry.target && entry.target.id === protectedUserId;
        const hasDeafenChange = entry.changes?.some(
          (change) => change.key === "deaf"
        );

        return (
          isRecentEnough &&
          isTargetMatch &&
          hasDeafenChange &&
          entry.executor &&
          !entry.executor.bot
        );
      });

      if (deafenLog && deafenLog.executor.id !== protectedUserId) {
        const executor = deafenLog.executor;
        console.log(`🎯 CONFIRMED: ${executor.tag} deafened protected user`);

        // Try to find and punish the executor in any voice channel across all servers
        await this.findAndPunishUser(
          executor.id,
          "deafen",
          oldState.member.user.tag
        );
      }
    } catch (error) {
      console.error("❌ Error handling protected user deafen:", error.message);
    }
  }

  async handleProtectedUserMoved(oldState, newState) {
    try {
      const guild = oldState.guild;
      const protectedUserId = oldState.member.id;
      const targetChannel = newState.channel; // Where the protected user was moved to

      console.log(`🔍 Checking audit logs for MEMBER_MOVE actions...`);

      const auditLogs = await guild.fetchAuditLogs({
        type: "MEMBER_MOVE",
        limit: 10,
      });

      const moveLog = auditLogs.entries.find((entry) => {
        const isRecentEnough = Date.now() - entry.createdTimestamp < 10000;
        const isTargetMatch =
          entry.target && entry.target.id === protectedUserId;

        return (
          isRecentEnough &&
          isTargetMatch &&
          entry.executor &&
          !entry.executor.bot
        );
      });

      if (moveLog && moveLog.executor.id !== protectedUserId) {
        const executor = moveLog.executor;
        console.log(
          `🎯 CONFIRMED: ${executor.tag} moved protected user to ${targetChannel?.name}`
        );

        // Move the executor to the same channel where they moved the protected user
        await this.findAndMoveUser(
          executor.id,
          targetChannel,
          oldState.member.user.tag
        );
      }
    } catch (error) {
      console.error("❌ Error handling protected user move:", error.message);
    }
  }

  async findAndPunishUser(userId, action, protectedUserTag) {
    console.log(
      `🔍 Searching for user ${userId} across all servers to apply ${action}...`
    );

    for (const guild of this.client.guilds.cache.values()) {
      try {
        const member = guild.members.cache.get(userId);
        if (!member) {
          try {
            await guild.members.fetch(userId);
          } catch (error) {
            continue; // User not in this guild
          }
        }

        const fetchedMember = guild.members.cache.get(userId);
        if (fetchedMember && fetchedMember.voice.channel) {
          console.log(
            `🎯 Found ${fetchedMember.user.tag} in voice channel: ${fetchedMember.voice.channel.name} (${guild.name})`
          );

          try {
            if (action === "mute") {
              await fetchedMember.voice.setMute(
                true,
                `Muted protected user: ${protectedUserTag}`
              );
              console.log(
                `✅ Successfully muted ${fetchedMember.user.tag} in ${guild.name}`
              );
            } else if (action === "deafen") {
              await fetchedMember.voice.setDeaf(
                true,
                `Deafened protected user: ${protectedUserTag}`
              );
              console.log(
                `✅ Successfully deafened ${fetchedMember.user.tag} in ${guild.name}`
              );
            }
            return; // Found and punished, stop searching
          } catch (error) {
            console.log(
              `⚠️ Failed to ${action} ${fetchedMember.user.tag} in ${guild.name}: ${error.message}`
            );
          }
        }
      } catch (error) {
        // Skip guilds where bot doesn't have access
        continue;
      }
    }

    console.log(
      `⚠️ Could not find user ${userId} in any voice channel across all servers`
    );
  }

  async findAndMoveUser(userId, targetChannel, protectedUserTag) {
    console.log(
      `🔍 Searching for user ${userId} across all servers to move them to ${targetChannel?.name}...`
    );

    for (const guild of this.client.guilds.cache.values()) {
      try {
        const member = guild.members.cache.get(userId);
        if (!member) {
          try {
            await guild.members.fetch(userId);
          } catch (error) {
            continue; // User not in this guild
          }
        }

        const fetchedMember = guild.members.cache.get(userId);
        if (fetchedMember && fetchedMember.voice.channel) {
          console.log(
            `🎯 Found ${fetchedMember.user.tag} in voice channel: ${fetchedMember.voice.channel.name} (${guild.name})`
          );

          try {
            if (targetChannel && guild.id === targetChannel.guild.id) {
              // Move to the same channel where they moved the protected user
              await fetchedMember.voice.setChannel(
                targetChannel,
                `Moved protected user: ${protectedUserTag}`
              );
              console.log(
                `✅ Successfully moved ${fetchedMember.user.tag} to ${targetChannel.name}`
              );
            } else {
              // If target channel is not available, disconnect them
              await fetchedMember.voice.disconnect(
                `Moved protected user: ${protectedUserTag}`
              );
              console.log(
                `✅ Successfully disconnected ${fetchedMember.user.tag} as retaliation`
              );
            }
            return; // Found and moved, stop searching
          } catch (error) {
            console.log(
              `⚠️ Failed to move ${fetchedMember.user.tag}: ${error.message}`
            );
          }
        }
      } catch (error) {
        // Skip guilds where bot doesn't have access
        continue;
      }
    }

    console.log(
      `⚠️ Could not find user ${userId} in any voice channel across all servers`
    );
  }

  async findRandomVoiceChannel(guild, preferredCategory = null) {
    try {
      // Get all voice channels
      let voiceChannels = guild.channels.cache.filter(
        (channel) =>
          channel.type === "GUILD_VOICE" &&
          channel.members.size < (channel.userLimit || 99) // Handle unlimited channels
      );

      // First try to find channels in the same category
      if (preferredCategory) {
        const sameCategoryChannels = voiceChannels.filter(
          (channel) => channel.parentId === preferredCategory.id
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
      console.error("❌ Error finding random voice channel:", error.message);
      return null;
    }
  }
}

module.exports = EnhancedProtection;
