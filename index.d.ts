
declare module 'mongo-queue' {

  import { ObjectID } from 'mongodb';

  interface Record<T> {
    _id: ObjectID;
    receivedDate: Date;
    status: 'received'|'processed'|'failed'|'skipped'|'notified'|'notifyFailure';
    available: Date;
    data: T;
  }

  interface InitOpts<T> {
    mongoUrl: string;
    collectionName: string;
    processCron: string;
    onProcess: (record: Record<T>) => PromiseLike<any> | undefined;
    cleanupCron?: string;
    batchSize?: number;
    maxRecordAge?: number;
    retryLimit?: number;
    backoffMs?: number;
    backoffCoefficient?: number;
    onFailure?: (record: Record<T>) => PromiseLike<any> | undefined;
    continueProcessingOnError?: boolean;
  }

  interface Identifiable {
    _id: ObjectID;
  }

  interface Queue<T> {
    enqueue: (item: T) => PromiseLike<T&Identifiable>;
    processNextBatch: () => PromiseLike<void>;
    cleanup: () => PromiseLike<void>;
    resetRecords: (recordIDs: Array<string>) => PromiseLike<void>;
  }

  interface InitFn {
    <T>(opts: InitOpts<T>): Queue<T>;
  }

  interface FlowControl {
    skip: (delayMs: number) => any;
    fail: (err: Error) => any;
  }

  const init: InitFn & FlowControl;
  export = init;
}
