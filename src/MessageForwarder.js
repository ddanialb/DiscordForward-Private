const axios = require('axios');

class MessageForwarder {
    constructor(client, config) {
        this.client = client;
        this.config = config;
        
        this.setupEventListeners();
        if (config.webhookUrl) {
            console.log(`🔗 Webhook URL آماده: ${config.webhookUrl.substring(0, 50)}...`);
        }
    }

    setupEventListeners() {
        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });
    }

    async handleMessage(message) {
        // رد کردن پیام‌های خودمان برای جلوگیری از حلقه
        if (message.author.id === this.client.user.id) return;
        
        // فقط پیام‌های چنل مبدا را پردازش کن
        if (message.channel.id !== this.config.sourceChannelId) return;

        // اگر پیام خالی باشد، نادیده بگیر
        if (!message.content || message.content.trim() === '') return;

        try {
            // مستقیم از طریق webhook بفرست - بدون صف، بدون فایل، بدون embed
            await this.sendViaWebhook(message.content);
            console.log(`✅ پیام ارسال شد: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`);
            
        } catch (error) {
            console.error('❌ خطا در ارسال پیام:', error.message);
        }
    }

    // ارسال ساده پیام از طریق webhook - فقط محتوای متنی
    async sendViaWebhook(content) {
        // فقط محتوای ساده - هیچ embed، فایل، یا اطلاعات اضافی نیست
        const payload = {
            content: content
        };

        await axios.post(this.config.webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
    }
}

module.exports = MessageForwarder;