'use strict';

var Promise = require('bluebird');
var sinon = require('sinon');
var expect = require('expect');
require('sinon-as-promised')(Promise);
var mongoQueue = require('./index');

describe(__filename, function() {
  var COLLECTION_NAME = 'SMOKE_TEST_RECORDS';

  var db = require('./db')(process.env.QUEUE_TEST_URL);

  function getDb() {
    return db.getCollection(COLLECTION_NAME);
  }

  function getAllRecords() {
    return getDb().then(function(c) {
      return c.find().toArray();
    });
  }

  function removeAll() {
    return getDb().call('remove');
  }

  beforeEach(removeAll);

  it('Should smoke test', function() {
    this.timeout(15000); // This thing could run for a little bit

    var processStub = sinon.stub().resolves();

    var queue = mongoQueue({
      mongoUrl: process.env.QUEUE_TEST_URL,
      collectionName: COLLECTION_NAME,
      processCron: '*/5 * * * * *', // Every 5 seconds
      onProcess: processStub
    });

    queue.enqueue({
      foo: true
    });
    queue.enqueue({
      bar: true
    });

    // Wait long enough for it to process
    return Promise.delay(6000)
      .then(getAllRecords)
      .then(function(records) {
        expect(records.length).toEqual(2);
        expect(records[0]).toInclude({ status: 'processed' });
        expect(records[1]).toInclude({ status: 'processed' });

        expect(processStub.callCount).toEqual(2);
      })
      .then(function() {
        // Submit another record and make sure we process again
        return queue.enqueue({
          baz: true
        });
      })
      .then(function() {
        return Promise.delay(6000);
      })
      .then(getAllRecords)
      .then(function(records) {
        expect(records.length).toEqual(3);
        expect(records[0]).toInclude({ status: 'processed' });
        expect(records[1]).toInclude({ status: 'processed' });
        expect(records[2]).toInclude({ status: 'processed' });

        expect(processStub.callCount).toEqual(3);
      });
  });
});
