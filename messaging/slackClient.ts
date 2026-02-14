import { App } from '@slack/bolt';

type SlackEvent = {
  channel: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  subtype?: string;
};

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

class SlackMessageContext {
  event: SlackEvent;
  app: App;
  typingIntervalMs: number;
  maxMessageLength: number;
  text: string;
  chatId: string | undefined;
  private typingInterval: NodeJS.Timeout | null = null;

  constructor(event: SlackEvent, app: App, typingIntervalMs: number, maxMessageLength: number) {
    this.event = event;
    this.app = app;
    this.typingIntervalMs = typingIntervalMs;
    this.maxMessageLength = maxMessageLength;
    this.text = event.text || '';
    this.chatId = event.channel;
  }

  startTyping() {
    // Slack doesn't have a direct typing indicator API
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
      await this.app.client.chat.postMessage({
        channel: this.event.channel,
        text: chunk,
        thread_ts: this.event.thread_ts || this.event.ts,
      });
    }
  }

  async startLiveMessage(initialText = '…') {
    const result = await this.app.client.chat.postMessage({
      channel: this.event.channel,
      text: initialText,
      thread_ts: this.event.thread_ts || this.event.ts,
    });
    return result.ts as string | undefined;
  }

  async updateLiveMessage(messageTs: string, text: string) {
    try {
      await this.app.client.chat.update({
        channel: this.event.channel,
        ts: messageTs,
        text: text || '…',
      });
    } catch (error: any) {
      // Slack may throw error if message hasn't changed
      // We'll ignore those errors
      if (!error.message?.includes('message_not_found') && !error.message?.includes('cant_update_message')) {
        throw error;
      }
    }
  }

  async finalizeLiveMessage(messageTs: string, text: string) {
    const finalText = text || 'No response received.';
    const chunks = splitTextIntoChunks(finalText, this.maxMessageLength);

    try {
      await this.updateLiveMessage(messageTs, chunks[0] || 'No response received.');
    } catch (error: any) {
      const errorMessage = String(error?.message || '').toLowerCase();
      if (!errorMessage.includes('message_not_found') && !errorMessage.includes('cant_update_message')) {
        throw error;
      }
    }

    // Send remaining chunks as separate messages
    for (let index = 1; index < chunks.length; index += 1) {
      await this.app.client.chat.postMessage({
        channel: this.event.channel,
        text: chunks[index],
        thread_ts: this.event.thread_ts || this.event.ts,
      });
    }
  }

  async removeMessage(messageTs: string) {
    try {
      await this.app.client.chat.delete({
        channel: this.event.channel,
        ts: messageTs,
      });
    } catch (error) {
      console.error('Failed to delete Slack message:', error);
    }
  }
}

export class SlackMessagingClient {
  app: App;
  typingIntervalMs: number;
  maxMessageLength: number;
  private messageHandlers: Array<(messageContext: SlackMessageContext) => Promise<void> | void> = [];
  private errorHandlers: Array<(error: Error, messageContext: SlackMessageContext | null) => void> = [];

  constructor({
    token,
    signingSecret,
    appToken,
    typingIntervalMs,
    maxMessageLength,
  }: {
    token: string;
    signingSecret: string;
    appToken?: string;
    typingIntervalMs: number;
    maxMessageLength: number;
  }) {
    // Use Socket Mode if appToken is provided, otherwise use HTTP mode
    this.app = new App({
      token,
      signingSecret,
      ...(appToken
        ? {
            socketMode: true,
            appToken,
          }
        : {}),
    });

    this.typingIntervalMs = typingIntervalMs;
    this.maxMessageLength = maxMessageLength;

    // Listen to all message events
    this.app.message(async ({ message }) => {
      // Only handle regular messages (not bot messages)
      if (message.subtype === undefined && 'text' in message) {
        const messageContext = new SlackMessageContext(
          message as SlackEvent,
          this.app,
          this.typingIntervalMs,
          this.maxMessageLength,
        );

        for (const handler of this.messageHandlers) {
          try {
            await Promise.resolve(handler(messageContext));
          } catch (error) {
            console.error('Slack message handler failed:', error);
            this.handleError(error as Error, messageContext);
          }
        }
      }
    });

    this.app.error(async (error) => {
      console.error('Slack app error:', error);
      this.handleError(error as Error, null);
    });
  }

  onTextMessage(handler: (messageContext: SlackMessageContext) => Promise<void> | void) {
    this.messageHandlers.push(handler);
  }

  onError(handler: (error: Error, messageContext: SlackMessageContext | null) => void) {
    this.errorHandlers.push(handler);
  }

  private handleError(error: Error, messageContext: SlackMessageContext | null) {
    for (const handler of this.errorHandlers) {
      try {
        handler(error, messageContext);
      } catch (handlerError) {
        console.error('Error handler itself failed:', handlerError);
      }
    }
  }

  async launch() {
    await this.app.start();
    console.log('⚡️ Slack app is running!');
  }

  async sendTextToChat(chatId: string | number, text: string) {
    const channel = String(chatId);
    const chunks = splitTextIntoChunks(text, this.maxMessageLength);
    for (const chunk of chunks) {
      await this.app.client.chat.postMessage({
        channel,
        text: chunk,
      });
    }
  }

  stop(reason: string) {
    console.log(`Stopping Slack client: ${reason}`);
    this.app.stop();
  }
}
