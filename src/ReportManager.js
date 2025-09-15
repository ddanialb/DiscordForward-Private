const { Collection } = require("discord.js-selfbot-v13");

class ReportManager {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.sourceChannelId = config.sourceChannelId;
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.client.on("messageCreate", async (message) => {
      try {
        const parsed = this.parseCommand(message.content);
        if (!parsed) return;

        const { start, end } = parsed;

        await message.channel.send(
          `⏳ درحال جمع آوری اطلاعات بین ${this.formatDateFa(
            start
          )} تا ${this.formatDateFa(end)} از همین کانال...`
        );

        const channel = message.channel;

        const messages = await this.fetchMessagesBetween(channel, start, end);
        const { summary, scannedCount, matchedCount } =
          this.aggregatePurchases(messages);

        if (summary.length === 0) {
          await message.channel.send(
            `ℹ️ هیچ خریدی در این بازه پیدا نشد. (اسکن: ${scannedCount} | تطبیق: ${matchedCount})\nاگر مطمئنی خرید هست، یک نمونه از همان پیام‌ها را بفرست تا الگو را دقیق‌تر کنم.`
          );
          return;
        }

        const lines = summary.map(
          (s, idx) =>
            `${idx + 1}. ${s.username}: $${this.formatNumber(s.total)}`
        );
        const totalAll = summary.reduce((acc, s) => acc + s.total, 0);

        const header = `🔎 اسکن: ${scannedCount} پیام | تطبیق: ${matchedCount} خرید\n\n📊 مجموع هزینه ها از ${this.formatDateFa(
          start
        )} تا ${this.formatDateFa(end)} (کانال: ${channel.name || channel.id})`;
        const footer = `
—
جمع کل: $${this.formatNumber(totalAll)}`;

        const chunked = this.chunkString(
          `${header}\n\n${lines.join("\n")}${footer}`,
          1900
        );

        for (const chunk of chunked) {
          // eslint-disable-next-line no-await-in-loop
          await message.channel.send(chunk);
        }
      } catch (err) {
        try {
          await message.channel.send(
            `❌ خطا در ساخت گزارش: ${err.message || err}`
          );
        } catch (_) {}
      }
    });
  }

  parseCommand(content) {
    // Expected: !sum YYYY-MM-DD YYYY-MM-DD
    if (!content) return null;
    const parts = content.trim().split(/\s+/);
    if (parts.length !== 3) return null;
    if (parts[0] !== "!sum") return null;
    const start = this.parseDate(parts[1]);
    const end = this.parseDate(parts[2], true);
    if (!start || !end) return null;
    if (start.getTime() > end.getTime()) return null;
    return { start, end };
  }

  parseDate(s, toEndOfDay = false) {
    // Accept YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
    if (toEndOfDay) {
      return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  }

  formatDateFa(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async fetchMessagesBetween(channel, start, end) {
    const collected = new Collection();
    let lastId = undefined;
    const oldestAllowed = start.getTime();

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const batch = await channel.messages.fetch({
        limit: 100,
        before: lastId,
      });
      if (batch.size === 0) break;

      const msgs = Array.from(batch.values());
      for (const msg of msgs) {
        const ts = msg.createdTimestamp;
        if (ts >= start.getTime() && ts <= end.getTime()) {
          collected.set(msg.id, msg);
        }
      }

      // Prepare next page
      const oldest = msgs[msgs.length - 1];
      lastId = oldest.id;

      // Stop if we've gone past the start date significantly
      if (oldest.createdTimestamp < oldestAllowed) break;
    }

    return Array.from(collected.values()).sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );
  }

  aggregatePurchases(messages) {
    // Support variations:
    // - Latin/Persian markers: Gheymat|قیمت , Kharid|خرید
    // - qty formats: "1x", "1 x"
    // - currency: 10,000$ | $10,000
    // - digits: Western 0-9 and Arabic-Indic ۰-۹
    // - stray punctuation in username; stop username at first qty token
    const totalsByUserKey = new Map();
    const displayNameByUserKey = new Map();
    let scannedCount = 0;
    let matchedCount = 0;

    const arabicDigits = /[\u06F0-\u06F9]/; // ۰-۹
    const toEnglishDigits = (str) =>
      str.replace(/[\u06F0-\u06F9]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

    const patterns = [
      // user qty x ... Gheymat price$ ... Kharid (latin)
      /^(?<user>[^\n]+?)\s+(?<qty>[\d\u06F0-\u06F9]+)\s*[xX]\s+.+?\bGheymat\b\s+\$?\s*(?<price>[\d\u06F0-\u06F9,\.]+)\s*\$?\s+\bKharid\b/i,
      // Persian markers
      /^(?<user>[^\n]+?)\s+(?<qty>[\d\u06F0-\u06F9]+)\s*[xX]\s+.+?\bقیمت\b\s+\$?\s*(?<price>[\d\u06F0-\u06F9,\.]+)\s*\$?\s+\bخرید\b/i,
    ];

    for (const msg of messages) {
      let raw = (msg.content || "").trim();
      if (!raw) continue;

      // Normalize: strip code fences/backticks, formatting, ZWSP, different commas
      raw = raw
        .replace(/^```[a-zA-Z0-9]*\n?|```$/g, "")
        .replace(/```/g, "")
        .replace(/`/g, "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\*\_]/g, "")
        .replace(/[\u066C\u060C]/g, ",") // Arabic thousands/commas to ,
        .replace(/(?<=\d)[\.,](?=\d{3}(\b|\D))/g, ",")
        .replace(/\s+/g, " ")
        .trim();
      if (!raw) continue;

      // Support multiple lines inside one message
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        scannedCount += 1;
        const normalizedLine = line
          .replace(/(?<=\d)[\.,](?=\d{3}(\b|\D))/g, ",")
          .replace(/\s+/g, " ")
          .trim();

        let match = null;
        for (const rx of patterns) {
          match = rx.exec(normalizedLine);
          if (match) break;
        }
        if (!match) continue;
        matchedCount += 1;

        let username = match.groups.user.trim();
        // Trim trailing separators before qty
        username = username.replace(/[\-–—:,|]+\s*$/, "").trim();

        const normalizeUsername = (u) =>
          u
            .replace(/\s*_[\s_]*/g, "_") // unify underscores
            .replace(/\s+/g, " ") // collapse spaces
            .trim()
            .toLowerCase(); // case-insensitive key

        const qtyStr = toEnglishDigits(match.groups.qty);
        const qty = parseInt(qtyStr, 10) || 0;

        const priceStr = toEnglishDigits(match.groups.price)
          .replace(/[\.,](?=\d{3}(\b|\D))/g, "")
          .replace(/,/g, "");
        const price = parseInt(priceStr, 10) || 0;

        if (!username || qty <= 0 || price <= 0) continue;

        const key = normalizeUsername(username);
        const amount = qty * price;
        totalsByUserKey.set(key, (totalsByUserKey.get(key) || 0) + amount);
        if (!displayNameByUserKey.has(key)) {
          displayNameByUserKey.set(key, username);
        }
      }
    }

    const arr = Array.from(totalsByUserKey.entries()).map(([key, total]) => ({
      username: displayNameByUserKey.get(key) || key,
      total,
    }));

    arr.sort((a, b) => b.total - a.total);
    return { summary: arr, scannedCount, matchedCount };
  }

  formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  chunkString(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = ReportManager;
