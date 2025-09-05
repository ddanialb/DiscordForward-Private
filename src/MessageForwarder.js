class MessageForwarder {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
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
}

module.exports = MessageForwarder;