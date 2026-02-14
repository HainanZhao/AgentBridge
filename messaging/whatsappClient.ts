import { Client, Message } from 'whatsapp-web.js';

function splitTextIntoChunks(text: string, maxMessageLength: number): string[] {
  const normalizedText = String(text || '');
  if (!normalizedText) {
    return [''];
  }

  if (normalizedText.length <= maxMessageLength) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    const end = Math.min(start + maxMessageLength, normalizedText.length);
    chunks.push(normalizedText.slice(start, end));
    start = end;
  }

  return chunks;
}

class WhatsAppMessageContext {
  msg: Message;
  typingIntervalMs: number;
  maxMessageLength: number;
  text: string;
  chatId: string | undefined;
  private typingInterval: NodeJS.Timeout | null = null;

  constructor(msg: Message, typingIntervalMs: number, maxMessageLength: number) {
    this.msg = msg;
    this.typingIntervalMs = typingIntervalMs;
    this.maxMessageLength = maxMessageLength;
    this.text = msg.body || '';
    this.chatId = msg.from;
  }

  startTyping() {
    // WhatsApp Web.js doesn't support typing indicators in the same way
    // We'll use a no-op implementation to maintain interface compatibility
    const stopTyping = () => {
      if (this.typingInterval) {
        clearInterval(this.typingInterval);
        this.typingInterval = null;
      }
    };

    return stopTyping;
  }

  async sendText(text: string) {
    const chunks = splitTextIntoChunks(text, this.maxMessageLength);
    for (const chunk of chunks) {
      await this.msg.reply(chunk);
    }
  }

  async startLiveMessage(initialText = '…') {
    const sent = await this.msg.reply(initialText);
    return sent?.id?.id as string | undefined;
  }

  async updateLiveMessage(messageId: string, text: string) {
    // WhatsApp doesn't support editing messages in the same way as Telegram
    // We'll skip this functionality to maintain compatibility
    // Messages will be sent as new messages instead
  }

  async finalizeLiveMessage(messageId: string, text: string) {
    const finalText = text || 'No response received.';
    const chunks = splitTextIntoChunks(finalText, this.maxMessageLength);

    // Since WhatsApp doesn't support message editing,
    // we'll just send the response as regular messages
    for (const chunk of chunks) {
      await this.msg.reply(chunk);
    }
  }

  async removeMessage(messageId: string) {
    // WhatsApp message deletion is limited
    // We'll skip this for now to maintain compatibility
  }
}

export class WhatsAppMessagingClient {
  client: Client;
  typingIntervalMs: number;
  maxMessageLength: number;
  private messageHandlers: Array<(messageContext: WhatsAppMessageContext) => Promise<void> | void> = [];
  private errorHandlers: Array<(error: Error, messageContext: WhatsAppMessageContext | null) => void> = [];

  constructor({ typingIntervalMs, maxMessageLength, qrCallback }: { 
    typingIntervalMs: number; 
    maxMessageLength: number;
    qrCallback?: (qr: string) => void;
  }) {
    this.client = new Client({
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
    this.typingIntervalMs = typingIntervalMs;
    this.maxMessageLength = maxMessageLength;

    // Set up QR code handling
    this.client.on('qr', (qr) => {
      console.log('WhatsApp QR Code received. Scan with your phone to authenticate.');
      if (qrCallback) {
        qrCallback(qr);
      }
    });

    this.client.on('ready', () => {
      console.log('WhatsApp client is ready!');
    });

    this.client.on('authenticated', () => {
      console.log('WhatsApp client authenticated!');
    });

    this.client.on('message', (msg: Message) => {
      // Only handle text messages
      if (msg.type === 'chat' || msg.body) {
        const messageContext = new WhatsAppMessageContext(msg, this.typingIntervalMs, this.maxMessageLength);
        
        for (const handler of this.messageHandlers) {
          Promise.resolve(handler(messageContext)).catch((error) => {
            console.error('WhatsApp message handler failed:', error);
            this.handleError(error as Error, messageContext);
          });
        }
      }
    });
  }

  onTextMessage(handler: (messageContext: WhatsAppMessageContext) => Promise<void> | void) {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error, messageContext: WhatsAppMessageContext | null) => void) {
    this.errorHandlers.push(handler);
  }

  private handleError(error: Error, messageContext: WhatsAppMessageContext | null) {
    for (const handler of this.errorHandlers) {
      try {
        handler(error, messageContext);
      } catch (handlerError) {
        console.error('Error handler itself failed:', handlerError);
      }
    }
  }

  async launch() {
    await this.client.initialize();
  }

  async sendTextToChat(chatId: string | number, text: string) {
    const chunks = splitTextIntoChunks(text, this.maxMessageLength);
    for (const chunk of chunks) {
      await this.client.sendMessage(String(chatId), chunk);
    }
  }

  stop(reason: string) {
    console.log(`Stopping WhatsApp client: ${reason}`);
    this.client.destroy();
  }
}
