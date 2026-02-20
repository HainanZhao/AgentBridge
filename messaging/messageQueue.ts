type LogInfoFn = (message: string, details?: unknown) => void;

type CreateMessageQueueProcessorParams = {
  processSingleMessage: (messageContext: any, requestId: number) => Promise<void>;
  logInfo: LogInfoFn;
  getErrorMessage: (error: unknown, fallbackMessage?: string) => string;
};

export function createMessageQueueProcessor({
  processSingleMessage,
  logInfo,
  getErrorMessage,
}: CreateMessageQueueProcessorParams) {
  const messageQueue: Array<any> = [];
  let isQueueProcessing = false;
  let messageSequence = 0;

  const processQueue = async () => {
    if (isQueueProcessing) {
      return;
    }

    try {
      isQueueProcessing = true;
      while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        if (!item) {
          continue;
        }

        try {
          await processSingleMessage(item.messageContext, item.requestId);
          item.resolve();
        } catch (error: any) {
          logInfo('Message processing failed', { requestId: item.requestId, error: getErrorMessage(error) });
          item.reject(error);
        }
      }

      isQueueProcessing = false;

      // Check if more messages were added while we were processing
      if (messageQueue.length > 0) {
        processQueue();
      }
    } catch (error: any) {
      isQueueProcessing = false;
      logInfo('Queue processing error', { error: getErrorMessage(error) });
      console.error('Queue processing error:', error);
    }
  };

  const enqueueMessage = (messageContext: any) => {
    return new Promise<void>((resolve, reject) => {
      const requestId = ++messageSequence;
      messageQueue.push({ requestId, messageContext, resolve, reject });
      
      const queueLength = messageQueue.length;
      if (queueLength > 1) {
        logInfo('Message enqueued', { requestId, queueLength });
      }

      processQueue().catch((error) => {
        logInfo('Queue processor failed', { requestId, error: getErrorMessage(error) });
        console.error('Queue processor failed:', error);
      });
    });
  };

  return {
    enqueueMessage,
    getQueueLength: () => messageQueue.length,
  };
}
