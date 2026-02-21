import { CronScheduler } from '../scheduler/cronScheduler.js';
import { createScheduledJobHandler } from '../scheduler/scheduledJobHandler.js';
import { logInfo } from '../utils/error.js';
import { normalizeOutgoingText } from '../utils/commandText.js';
import type { Config } from '../utils/config.js';
import type { MessagingClient } from './MessagingInitializer.js';
import type { BaseCliAgent } from '../core/agents/index.js';

export interface SchedulerManagerOptions {
  config: Config;
  getMessagingClient: () => MessagingClient;
  cliAgent: BaseCliAgent;
  buildPromptWithMemory: (userPrompt: string) => Promise<string>;
  runScheduledPromptWithTempAcp: (promptForAgent: string, scheduleId: string) => Promise<string>;
  resolveTargetChatId: () => string | null;
  getEnqueueMessage: () => (messageContext: any) => Promise<void>;
  appendContextToAgent: (text: string) => Promise<void>;
}

export class SchedulerManager {
  private cronScheduler: CronScheduler;

  constructor(options: SchedulerManagerOptions) {
    const handleScheduledJob = createScheduledJobHandler({
      logInfo,
      buildPromptWithMemory: options.buildPromptWithMemory,
      runScheduledPromptWithTempAcp: options.runScheduledPromptWithTempAcp,
      resolveTargetChatId: options.resolveTargetChatId,
      sendTextToChat: (chatId, text) => {
        const client = options.getMessagingClient();
        if (client) {
          return client.sendTextToChat(chatId, text);
        }
        logInfo('Warning: messagingClient not yet initialized when sending scheduled job text');
        return Promise.resolve();
      },
      normalizeOutgoingText,
      appendContextToAgent: options.appendContextToAgent,
    });

    this.cronScheduler = new CronScheduler(handleScheduledJob, {
      persistenceFilePath: options.config.SCHEDULES_FILE_PATH,
      timezone: options.config.TZ,
      logInfo,
    });

    logInfo('Scheduler persistence configured', {
      schedulesFilePath: options.config.SCHEDULES_FILE_PATH,
    });
  }

  public getCronScheduler(): CronScheduler {
    return this.cronScheduler;
  }

  public shutdown(): void {
    this.cronScheduler.shutdown();
  }
}
