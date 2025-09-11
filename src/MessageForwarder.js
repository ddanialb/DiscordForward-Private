const axios = require("axios");

class MessageForwarder {
  constructor(client, config) {
    this.client = client;
    this.config = config;

    this.setupEventListeners();
    if (config.webhookUrl) {
      console.log(
        `🔗 Webhook URL ready: ${config.webhookUrl.substring(0, 50)}...`
      );
    }
  }

  setupEventListeners() {
    this.client.on("messageCreate", async (message) => {
      await this.handleMessage(message);
    });
  }

  async handleMessage(message) {
    // Ignore our own messages to prevent loops
    if (message.author.id === this.client.user.id) return;

    // Only process messages from the source channel
    if (message.channel.id !== this.config.sourceChannelId) return;

    // If message is empty, ignore it
    if (!message.content || message.content.trim() === "") return;

    try {
      // Extract username from bot's display name (remove "APP" suffix)
      const botDisplayName =
        message.author.displayName || message.author.username;
      const extractedUsername = this.extractUsername(botDisplayName);

      // Format message content with username suffix for log messages
      const formattedContent = this.formatLogMessage(
        message.content,
        extractedUsername
      );

      // Send directly via webhook with extracted username
      await this.sendViaWebhook(formattedContent, extractedUsername);
      console.log(
        `✅ Message sent from ${extractedUsername}: "${formattedContent.substring(
          0,
          50
        )}${formattedContent.length > 50 ? "..." : ""}"`
      );
    } catch (error) {
      console.error("❌ Error sending message:", error.message);
    }
  }

  // Extract username from bot display name (remove "APP" suffix)
  extractUsername(displayName) {
    if (!displayName) return "Unknown";

    // Remove "APP" suffix if present
    if (displayName.endsWith(" APP")) {
      return displayName.slice(0, -4); // Remove " APP" (4 characters)
    }

    return displayName;
  }

  // Format log messages with username suffix
  formatLogMessage(content, username) {
    // Check if message is a log message that needs username suffix
    const logPatterns = [
      /^Withdrawn\s+/i,
      /^Deposited\s+/i,
      /^Gozashtan\s+Pool/i,
      /^Bardashtan\s+Pool/i,
    ];

    // Check if content matches any log pattern
    const isLogMessage = logPatterns.some((pattern) =>
      pattern.test(content.trim())
    );

    if (isLogMessage) {
      // Add username suffix to log messages
      return `${content} - ${username}`;
    }

    // Return original content for non-log messages
    return content;
  }

  // Simple message sending via webhook - only text content
  async sendViaWebhook(content, username = null) {
    // Only simple content - no embeds, files, or additional information
    const payload = {
      content: content,
    };

    // Add username if provided
    if (username) {
      payload.username = username;
    }

    await axios.post(this.config.webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }
}

module.exports = MessageForwarder;
