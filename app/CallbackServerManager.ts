import { createCallbackServer } from '../core/callbackServer.js';
import { logInfo } from '../utils/error.js';
import type { Config } from '../utils/config.js';
import type { MessagingClient } from './MessagingInitializer.js';
import type { CronScheduler } from '../scheduler/cronScheduler.js';
import type { SemanticConversationMemory } from '../utils/semanticConversationMemory.js';

export interface CallbackServerManagerOptions {
  config: Config;
  cronScheduler: CronScheduler;
  messagingClient: MessagingClient;
  getLastIncomingChatId: () => string | null;
  semanticConversationMemory: SemanticConversationMemory;
}

export class CallbackServerManager {
  private startCallbackServer: () => void;
  private stopCallbackServer: () => void;

  constructor(options: CallbackServerManagerOptions) {
    const { startCallbackServer, stopCallbackServer } = createCallbackServer({
      callbackHost: options.config.CALLBACK_HOST,
      callbackPort: options.config.CALLBACK_PORT,
      callbackAuthToken: options.config.CALLBACK_AUTH_TOKEN,
      callbackMaxBodyBytes: options.config.CALLBACK_MAX_BODY_BYTES,
      cronScheduler: options.cronScheduler,
      messagingClient: options.messagingClient,
      messagingPlatform: options.config.MESSAGING_PLATFORM,
      getLastIncomingChatId: options.getLastIncomingChatId,
      semanticConversationMemory: options.semanticConversationMemory,
      conversationHistoryMaxTotalChars: options.config.CONVERSATION_HISTORY_MAX_TOTAL_CHARS,
      conversationHistoryRecapTopK: options.config.CONVERSATION_HISTORY_RECAP_TOP_K,
      logInfo,
    });

    this.startCallbackServer = startCallbackServer;
    this.stopCallbackServer = stopCallbackServer;
  }

  public start(): void {
    this.startCallbackServer();
  }

  public stop(): void {
    this.stopCallbackServer();
  }
}
