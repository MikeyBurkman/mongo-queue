
interface IRecord<T> {
  data: T
}

interface IQueueOpts<T> {
  mongoUrl: string;
  collectionName: string;
  onProcess: (record: Record<T>) => Promise<any>;
  processCron: string;

  batchSize?: number;
  cleanupCron?: string;
  maxRecordAge?: number;
  onFailure?: (record: Record<T>) => Promise<any>;
  retryLimit?: number;
  continueProcessingOnError?: boolean;
  backoffMs?: number;
  backoffCoefficient?: number;
}

interface IQueue<T> {
  enqueue: (data: T) => Promise<Record<T>>;
  processNextBatch: () => Promise<any>;
  cleanup: () => Promise<any>;
  resetRecords: (recordIDs: Array<string>) => Promise<number>; // TODO: ObjectID type?
}

declare function createQueue<T>(opts: IQueueOpts<T>): IQueue<T>;
