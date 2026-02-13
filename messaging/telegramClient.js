import { Telegraf } from 'telegraf';

class TelegramMessageContext {
  constructor(ctx, typingIntervalMs) {
    this.ctx = ctx;
    this.typingIntervalMs = typingIntervalMs;
    this.text = ctx.message?.text || '';
    this.chatId = ctx.chat?.id;
  }

  startTyping() {
    this.ctx.telegram.sendChatAction(this.ctx.chat.id, 'typing').catch(() => {});

    const intervalId = setInterval(() => {
      this.ctx.telegram.sendChatAction(this.ctx.chat.id, 'typing').catch(() => {});
    }, this.typingIntervalMs);

    return () => clearInterval(intervalId);
  }

  async sendText(text) {
    await this.ctx.reply(text);
  }
}

export class TelegramMessagingClient {
  constructor({ token, typingIntervalMs }) {
    this.bot = new Telegraf(token);
    this.typingIntervalMs = typingIntervalMs;
  }

  onTextMessage(handler) {
    this.bot.on('text', (ctx) => {
      const messageContext = new TelegramMessageContext(ctx, this.typingIntervalMs);
      Promise.resolve(handler(messageContext)).catch((error) => {
        console.error('Text message handler failed:', error);
      });
    });
  }

  onError(handler) {
    this.bot.catch((error, ctx) => {
      const messageContext = ctx?.chat
        ? new TelegramMessageContext(ctx, this.typingIntervalMs)
        : null;
      handler(error, messageContext);
    });
  }

  async launch() {
    await this.bot.launch();
  }

  async sendTextToChat(chatId, text) {
    await this.bot.telegram.sendMessage(chatId, text);
  }

  stop(reason) {
    this.bot.stop(reason);
  }
}
