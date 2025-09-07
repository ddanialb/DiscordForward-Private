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
      // Send directly via webhook - no queue, no files, no embeds
      await this.sendViaWebhook(message.content);
      console.log(
        `✅ Message sent: "${message.content.substring(0, 50)}${
          message.content.length > 50 ? "..." : ""
        }"`
      );
    } catch (error) {
      console.error("❌ Error sending message:", error.message);
    }
  }

  // Simple message sending via webhook - only text content
  async sendViaWebhook(content) {
    // Only simple content - no embeds, files, or additional information
    const payload = {
      content: content,
    };

    await axios.post(this.config.webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }
}

module.exports = MessageForwarder;
