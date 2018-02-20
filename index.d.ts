
declare module 'mongo-queue' {

  import { ObjectID } from 'mongodb';

  interface InitOpts<T> {
    mongoUrl: string;
    collectionName: string;
    processCron: string;
    onProcess: (record: T) => Promise<any> | undefined;
    cleanupCron?: string;
    batchSize?: number;
    maxRecordAge?: number;
    retryLimit?: number;
    backoffMs?: number;
    onFailure?: (record: T) => Promise<any> | undefined;
  }

  interface Identifiable {
    _id: ObjectID;
  }

  interface Queue<T> {
    enqueue: (record: T) => Promise<T&Identifiable>;
    processNextBatch: () => Promise<void>;
    cleanup: () => Promise<void>;
    resetRecords: (recordIDs: Array<string>) => Promise<void>;
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
