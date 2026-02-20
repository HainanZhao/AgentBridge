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
    logInfo('processQueue called', { isQueueProcessing, queueLength: messageQueue.length });
    if (isQueueProcessing) {
      logInfo('Queue processing already in progress, skipping', { queueLength: messageQueue.length });
      return;
    }

    try {
      isQueueProcessing = true;
      logInfo('Starting queue processing', { queueLength: messageQueue.length });
      while (messageQueue.length > 0) {
        const item = messageQueue.shift();
        if (!item) {
          continue;
        }

        try {
          logInfo('Processing queued message', { requestId: item.requestId, queueLength: messageQueue.length });
          await processSingleMessage(item.messageContext, item.requestId);
          logInfo('Message processed successfully', { requestId: item.requestId });
          item.resolve();
        } catch (error: any) {
          logInfo('Message processing failed', { requestId: item.requestId, error: getErrorMessage(error) });
          item.reject(error);
        }
      }

      isQueueProcessing = false;
      logInfo('Queue processing complete', { queueLength: messageQueue.length });

      // Check if more messages were added while we were processing
      if (messageQueue.length > 0) {
        logInfo('More messages in queue after processing, continuing...', { queueLength: messageQueue.length });
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
      logInfo('Message enqueued, calling processQueue', { requestId, queueLength: messageQueue.length });
      logInfo('Message enqueued', { requestId, queueLength: messageQueue.length });
      processQueue()
        .then(() => {
          logInfo('Queue processing completed for enqueued message', { requestId });
        })
        .catch((error) => {
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
