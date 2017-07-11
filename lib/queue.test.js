'use strict';

const dbUrl = process.env.QUEUE_TEST_URL;

const retryQueue = require('./queue');
const index = require('./index');
const db = require('./db')(dbUrl);

const R = require('ramda');
const sinon = require('sinon');
const Promise = require('bluebird');
const expect = require('expect');
require('sinon-as-promised')(Promise);

const collectionName = 'PAYLOAD_QUEUE';

function getDb() {
  return db.getCollection(collectionName);
}

function getAllRecords() {
  return getDb()
    .then(function(c) {
      return c.find().toArray();
    })
    .then(R.sortBy(R.prop('receivedDate')));
}

function removeAll() {
  return getDb().call('remove');
}

describe(__filename, function() {
  let onProcessStub;
  let onFailureStub;

  function createQueue(overrides) {
    overrides = overrides || {};
    return retryQueue(
      Object.assign(
        {
          collectionName: collectionName,
          batchSize: 10,
          retryLimit: 1,
          maxRecordAge: 10000,
          onProcess: onProcessStub,
          onFailure: onFailureStub,
          mongoUrl: dbUrl,
          continueProcessingOnError: true
        },
        overrides
      )
    );
  }

  beforeEach(function() {
    onProcessStub = sinon.stub().resolves();
    onFailureStub = sinon.stub().resolves();
  });

  beforeEach(removeAll);

  describe('#Enqueue', function() {
    it('Should enqueue records', function() {
      const queue = createQueue();

      return queue.enqueue({ foo: true, id: 'myId' }).then(function(res) {
        // Make sure that enqueue returns the created object
        expect(res).toIncludeKeys(['_id', 'receivedDate']);
        expect(res).toInclude({ status: 'received', data: { foo: true, id: 'myId' } });
      });
    });
  });

  it('Should happy path', function() {
    const queue = createQueue();

    return queue
      .enqueue({ foo: true })
      .then(function() {
        return queue.processNextBatch();
      })
      .then(function() {
        // Expect the record we just added to be passed to the processor
        expect(onProcessStub.callCount).toEqual(1);
        expect(onProcessStub.getCall(0).args[0]).toIncludeKey('receivedDate');
        expect(onProcessStub.getCall(0).args[0]).toInclude({
          status: 'received',
          data: { foo: true }
        });
        expect(onFailureStub.callCount).toEqual(0);
      })
      .then(function() {
        // Try processing again, make sure we don't re-process the same record twice
        return queue.processNextBatch();
      })
      .then(function() {
        expect(onProcessStub.callCount).toEqual(1); // Still is 1
        expect(onFailureStub.callCount).toEqual(0); // Still is 0
      });
  });

  it('Should process only batchSize each time', function() {
    const queue = createQueue({
      batchSize: 1
    });

    // Add two records, and make sure each is processed individually because batchSize == 1
    return Promise.all([queue.enqueue({ foo: 1 }), queue.enqueue({ foo: 2 })])
      .then(function() {
        return queue.processNextBatch();
      })
      .then(function() {
        // Expect the first record we just added to be passed to the processor
        expect(onProcessStub.callCount).toEqual(1);
        expect(onProcessStub.getCall(0).args[0]).toIncludeKey('receivedDate');
        expect(onProcessStub.getCall(0).args[0]).toInclude({
          status: 'received',
          data: { foo: 1 }
        });

        expect(onFailureStub.callCount).toEqual(0);
      })
      .then(function() {
        // Process the next batch
        return queue.processNextBatch();
      })
      .then(function() {
        // Expect the SECOND record we just added to be passed to the processor
        expect(onProcessStub.callCount).toEqual(2);
        expect(onProcessStub.getCall(1).args[0]).toIncludeKey('receivedDate');
        expect(onProcessStub.getCall(1).args[0]).toInclude({
          status: 'received',
          data: { foo: 2 }
        });

        expect(onFailureStub.callCount).toEqual(0);
      });
  });

  describe('#Failures in processing', function() {
    it('Should not retry and immediately notify if a retryLimit is not set', function() {
      onProcessStub.onCall(0).rejects(new Error('boo'));

      const queue = createQueue();

      return queue
        .enqueue({ foo: 1 })
        .then(function() {
          // Process it successfully
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(1);
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(records.length).toEqual(1);
          expect(records[0]).toInclude({ status: 'failed', retryCount: 1 });
          expect(records[0].failureReason).toContain('boo');
        })
        .then(function() {
          // The second time we process it will be marked as failed
          return queue.processNextBatch();
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(onProcessStub.callCount).toEqual(1);

          expect(records.length).toEqual(1);
          expect(records[0]).toInclude({ status: 'notified' });
        });
    });

    it('Should retry a failure', function() {
      onProcessStub.onCall(0).rejects(new Error('boo'));
      onProcessStub.onCall(1).resolves();

      const queue = createQueue({
        batchSize: 1,
        retryLimit: 2
      });

      return queue
        .enqueue({ foo: 1 })
        .then(function() {
          // Process it successfully
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(1);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(records.length).toEqual(1);
          expect(records[0]).toInclude({ status: 'failed', retryCount: 1 });
          expect(records[0].failureReason).toContain('boo');
        })
        .then(function() {
          // Try again!
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(2);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(getAllRecords)
        .then(function(records) {
          // Should be successful this time
          expect(records.length).toEqual(1);
          expect(records[0]).toInclude({ status: 'processed' });
          expect(records[0]).toExcludeKeys(['retryCount', 'failureReason']);
        });
    });

    it('Should call the onFailure function when it reaches the retryLimit', function() {
      onProcessStub.rejects(new Error('boo'));

      const queue = createQueue({
        batchSize: 1,
        retryLimit: 3
      });

      return queue
        .enqueue({ foo: 1 })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(1);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          // Retry once...
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(2);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          // Twice...
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(3);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          // Three times, the failure...
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(3);
          expect(onFailureStub.callCount).toEqual(1);
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(records.length).toEqual(1);
          expect(records[0]).toInclude({ retryCount: 3, status: 'notified' });
        })
        .then(function() {
          // Make sure if we process again, it doesn't get picked up again
          return queue.processNextBatch();
        })
        .then(function() {
          // Should still be the same as before
          expect(onProcessStub.callCount).toEqual(3);
          expect(onFailureStub.callCount).toEqual(1);
        });
    });

    it('Should not let a failure to nofity stop processing of other records', function() {
      onProcessStub.onCall(0).rejects(new Error('boo')); // First record will fail
      onProcessStub.onCall(1).resolves(); // Second record will pass
      onProcessStub.onCall(2).resolves(); // Third record will pass
      onFailureStub.rejects(new Error('Error in notify'));

      const queue = createQueue({
        batchSize: 2
      });

      return queue
        .enqueue({ foo: 1 })
        .then(() => queue.enqueue({ foo: 2 }))
        .then(() => queue.enqueue({ foo: 3 }))
        .then(() => queue.processNextBatch())
        .then(() => {
          expect(onProcessStub.callCount).toEqual(2); // Should have processed 2 records (batch size) -- the first will have failed
        })
        .then(() => queue.processNextBatch()) // Re-process the first, and also process the third record
        .then(() => {
          expect(onFailureStub.callCount).toEqual(1); // First record should have been passed to onFailure()
          expect(onFailureStub.getCall(0).args[0]).toInclude({ data: { foo: 1 } });

          expect(onProcessStub.callCount).toEqual(3); // Should have still continued on to processed the third record
        })
        .then(getAllRecords)
        .then((records) => {
          const sortedRecords = R.sortBy(R.path(['data', 'foo']), records);
          expect(sortedRecords[0]).toInclude({ status: 'notifyFailure' });
          expect(sortedRecords[0]).toIncludeKey('notifyFailureReason');
          expect(sortedRecords[1]).toInclude({ status: 'processed' });
          expect(sortedRecords[2]).toInclude({ status: 'processed' });
        });
    });

    it('Should backoff exponentially on errors', function() {
      onProcessStub.rejects(new Error('boo'));

      const queue = createQueue({
        retryLimit: 3,
        backoffMs: 50
      });

      return queue
        .enqueue({ foo: 1 })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(1);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          // Should not have processed the record so soon
          expect(onProcessStub.callCount).toEqual(1);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          return Promise.delay(51);
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          // We've waited long enough, should process
          expect(onProcessStub.callCount).toEqual(2);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          return Promise.delay(51);
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          // 50ms should not have been enough to process again yet
          expect(onProcessStub.callCount).toEqual(2);
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          return Promise.delay(150);
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          // We've waited long enough, should process
          expect(onProcessStub.callCount).toEqual(3);
          expect(onFailureStub.callCount).toEqual(0);
        });
    });

    it('Should not process any more records if a record fails and continueProcessingOnError is false', function() {
      onProcessStub.onCall(0).rejects(new Error('boo')); // Reject the first time
      onProcessStub.resolves(); // Resolve subsequent time

      const queue = createQueue({
        continueProcessingOnError: false,
        retryLimit: 3,
        backoffMs: 50
      });

      return queue
        .enqueue({ foo: 1 })
        .then(function() {
          // Just delay slightly so that our received dates are different
          return Promise.delay(1);
        })
        .then(function() {
          return queue.enqueue({ foo: 2 });
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(1); // Just the one record was processed
          expect(onProcessStub.getCall(0).args[0]).toInclude({ data: { foo: 1 } });
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          // Should not have processed anything yet because we're waiting for the first one to succeed
          expect(onProcessStub.callCount).toEqual(1); // Still just that one record that was processed
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(records.length).toEqual(2);
          expect(records[0]).toInclude({ status: 'failed' }); // First record failed
          expect(records[1]).toInclude({ status: 'received' }); // Second record was not touched
        })
        .then(function() {
          return Promise.delay(51);
        })
        .then(function() {
          // Everything should process this time
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(3); // The first failed process + the two successes
          expect(onProcessStub.getCall(1).args[0]).toInclude({ data: { foo: 1 } }); // Make sure in the correct order
          expect(onProcessStub.getCall(2).args[0]).toInclude({ data: { foo: 2 } });
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(getAllRecords)
        .then(function(records) {
          // Both should be processed
          expect(records.length).toEqual(2);
          expect(records[0]).toInclude({ status: 'processed' });
          expect(records[1]).toInclude({ status: 'processed' });
        });
    });
  });

  describe('#Cleanup', function() {
    it('Should clean up records beyond their maxRecordAge', function() {
      const queue = createQueue({
        maxRecordAge: 100
      });

      return queue
        .enqueue({ foo: 1 })
        .then(function() {
          // Process it successfully
          return queue.processNextBatch();
        })
        .then(function() {
          return Promise.delay(150); // Wait for the processed record to expire
        })
        .then(function() {
          // Add a second record that will not be processed.
          // This one should not be deleted when cleaning up!
          return queue.enqueue({ foo: 2 });
        })
        .then(function() {
          return queue.cleanup();
        })
        .then(getAllRecords)
        .then(function(records) {
          // We should have deleted the first record, but kept the second
          expect(records.length).toEqual(1);
          expect(records[0]).toInclude({ data: { foo: 2 } });
        });
    });
  });

  describe('#fail', function() {
    it('Should fail the record immediately and not reprocess it if fail is called', function() {
      onProcessStub.rejects(index.fail('Validation failure'));

      const queue = createQueue();

      return queue
        .enqueue({ foo: true })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(1);
          expect(onProcessStub.getCall(0).args[0]).toInclude({ data: { foo: true } });
          expect(onFailureStub.callCount).toEqual(1);
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(records.length).toEqual(1);
          // Should have been updated to 'skipped' in mongo
          expect(records[0]).toIncludeKey('processedDate');
          expect(records[0]).toInclude({ status: 'notified', failureReason: 'Validation failure' });
          expect(records[0]).toExcludeKey('retryCount');
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          // Nothing should have processed again
          expect(onProcessStub.callCount).toEqual(1);
          expect(onFailureStub.callCount).toEqual(1);
        });
    });
  });

  describe('#skip', function() {
    it('Should not update the record status if skip is called', function() {
      // First call we'll tell it to skip the record
      // Second call should update the status like normal
      onProcessStub.onCall(0).rejects(index.skip(100));
      onProcessStub.onCall(1).resolves();

      const queue = createQueue();

      return queue
        .enqueue({ foo: true })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          expect(onProcessStub.callCount).toEqual(1);
          expect(onProcessStub.getCall(0).args[0]).toInclude({
            status: 'received',
            data: { foo: true }
          });
          expect(onProcessStub.getCall(0).args[0]).toIncludeKey('receivedDate');
          expect(onFailureStub.callCount).toEqual(0);
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(records.length).toEqual(1);
          // Should have been updated to 'skipped' in mongo
          expect(records[0]).toInclude({ status: 'skipped' });
          expect(records[0]).toIncludeKey('processedDate');
          expect(records[0]).toExcludeKeys(['retryCount', 'failureReason']);
        })
        .then(function() {
          return queue.processNextBatch();
        })
        .then(function() {
          // Should not process this time because it hasn't been long enough
          expect(onProcessStub.callCount).toEqual(1);
        })
        .then(function() {
          return Promise.delay(150);
        })
        .then(function() {
          // Should not process this time because it hasn't been long enough
          return queue.processNextBatch();
        })
        .then(getAllRecords)
        .then(function(records) {
          expect(onProcessStub.callCount).toEqual(2);

          expect(records.length).toEqual(1);
          expect(records[0]).toInclude({ status: 'processed' });
          expect(records[0]).toExcludeKeys(['retryCount', 'failureReason']);
        });
    });
  });

  describe('#resetRecords', function() {
    it('Should reset only the record IDs (strings or ObjectIds) given to it', function() {
      const queue = createQueue();

      return queue
        .enqueue({ foo: 1 })
        .then(() => queue.enqueue({ foo: 2 }))
        .then(() => queue.enqueue({ foo: 3 }))
        .then(() => queue.processNextBatch())
        .then(getAllRecords)
        .then((records) => {
          expect(records.length).toEqual(3);
          expect(records[0]).toInclude({ status: 'processed' });
          expect(records[1]).toInclude({ status: 'processed' });
          expect(records[2]).toInclude({ status: 'processed' });

          const id1 = records[0]._id; // This is an ObjectId
          const id2 = records[1]._id; // We'll convert this below to a string -- it should still work
          const id3 = records[2]._id;

          return queue
            .resetRecords([id1, id2.toString()])
            .then((numUpdated) => expect(numUpdated).toEqual(2))
            .then(getAllRecords)
            .then((records) => {
              expect(records.length).toEqual(3);

              // Ordering may have switched, so make sure we're validating the correct objects
              const record1 = R.find(R.propEq('_id', id1), records);
              const record2 = R.find(R.propEq('_id', id2), records);
              const record3 = R.find(R.propEq('_id', id3), records);

              expect(record1).toInclude({ status: 'received' });
              expect(record1).toIncludeKey('resetDate');

              expect(record2).toInclude({ status: 'received' });
              expect(record2).toIncludeKey('resetDate');

              expect(record3).toInclude({ status: 'processed' }); // Should not have been touched
            })
            .then(() => queue.processNextBatch())
            .then(getAllRecords)
            .then((records) => {
              // Finally, make sure that the records we reset were eligible to be processed again
              records.forEach((r) => {
                expect(r).toInclude({ status: 'processed' });
              });
            });
        });
    });
  });
});
