
declare module 'mongo-queue' {

  import { ObjectID } from 'mongodb';

  export = MongoQueue;

  function MongoQueue<T>(opts: MongoQueue.InitOpts<T>): MongoQueue.Queue<T>;

  namespace MongoQueue {

    export interface Record<T> {
      _id: ObjectID;
      receivedDate: Date;
      status: 'received'|'processed'|'failed'|'skipped'|'notified'|'notifyFailure';
      available: Date;
      data: T;
    }

    export interface FailedRecord<T> extends Record<T> {
      failureReason: string;
    }

    export interface InitOpts<T> {
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
      onFailure?: (record: FailedRecord<T>) => PromiseLike<any> | undefined;
      continueProcessingOnError?: boolean;
    }

    export interface Identifiable {
      _id: ObjectID;
    }

    export interface Queue<T> {
      enqueue: (item: T) => PromiseLike<T&Identifiable>;
      processNextBatch: () => PromiseLike<void>;
      cleanup: () => PromiseLike<void>;
      resetRecords: (recordIDs: Array<string>) => PromiseLike<void>;
    }

    export const skip: (delayMs: number) => any;
    export const fail: (err: Error) => any;
  }

}
