'use strict';

// Retry queue logic using Mongo

var Promise = require('bluebird');
var moment = require('moment');
var uuid = require('node-uuid');
var xtend = require('xtend');
var queueDb = require('./db');
var skip = require('./skip');

var STATUS_CODES = {
  received: 'received',
  processed: 'processed',
  failed: 'failed',
  notified: 'notified'
};


/**
 * Creates a batch processor/uploader instance that can be used to trigger a
 * job on a set schedule. The purpose of this is to write client data to a
 * temporary table before sending to a system of record. This improves response
 * times for clients, and places the retry responsibility on the cloud
 * application meaning less battery and bandwith used by a client.
 *
 * @param  {Object} opts
 * @return {Object}
 */
module.exports = function(opts) {
  var collectionName = opts.collectionName;
  var batchSize = opts.batchSize;
  var maxRecordAge = opts.maxRecordAge;
  var onProcess = opts.onProcess;
  var onFailure = opts.onFailure;
  var retryLimit = opts.retryLimit;
  var conditionFn = opts.conditionFn || function() {
    return {};
  };

  var db = queueDb(opts.mongoUrl);

  return {
    enqueue: enqueue,
    processNextBatch: processNextBatch,
    cleanup: cleanup
  };

  /**
   * Add an item to the queue for processing.
   *
   * Callback is called or Promise is resolved when it has been written to
   * MongoDB for processing in the future.
   *
   * @param  {Object}   record The data from a client or other function
   * @param  {Function} cb
   * @return {Promise}
   */
  function enqueue(record, cb) {
    return insertNewRecord(record)
      .asCallback(cb);
  }

  /**
   * Query for everything in the given collection with status [received, failed]
   * and try to process them using the onProcess function provided to our
   * original opts Object
   *
   * Procesing occurs in series.
   *
   * The returned promise resolves when all items are processed, and rejected
   * if a failire occurs.
   *
   * @return {Promise}
   */
  function processNextBatch(callback) {
    return Promise.resolve()
      .then(getNextBatch)
      .mapSeries(processRecord)
      .asCallback(callback);
  }

  /**
   * Deletes any records with status=processed and a processedDate older than
   * the given maxRecordAge
   *
   * @return {Promise}
   */
  function cleanup(callback) {
    return Promise.resolve()
      .then(getCollection)
      .then(function(collection) {
        var minDate = moment().subtract(maxRecordAge, 'ms').toDate();
        return collection.remove({
          status: STATUS_CODES.processed,
          processedDate: {
            $lte: minDate
          }
        });
      })
      .asCallback(callback);
  }

  function getCollection() {
    return db.getCollection(collectionName);
  }

  function insertNewRecord(record) {
    return getCollection().then(function(collection) {

      var data = {
        receivedDate: new Date(),
        status: STATUS_CODES.received,
        id: uuid.v4(), // Until FH studio exposes _id
        data: record
      };

      return collection.insert(data);
    })
    .then(function(result) {
      return result.ops[0]; // Returns the newly-inserted object
    });
  }

  function processRecord(record) {
    // If retryLimit is negative, then we'll retry forever
    if (recordHasFailed(record)) {
      return notifyFailedRecord(record);

    } else {
      return Promise.resolve().then(function() {
        return onProcess(record);
      })
      .then(function() {
        return processSuccess(record);
      })
      .catch(function(err) {
        if (err !== skip) {
          return processFailure(record, err);
        }
      });
    }
  }

  function recordHasFailed(record) {
    return retryLimit >= 0 &&
      record.retryCount &&
      record.retryCount >= retryLimit;
  }

  function getNextBatch() {

    var query = xtend({
      status: {
        $in: [STATUS_CODES.received, STATUS_CODES.failed]
      }
    }, conditionFn());

    return getCollection().then(function(collection) {
      return collection.find(query)
      .limit(batchSize)
      .toArray();
    });
  }

  function processSuccess(record) {
    return getCollection().then(function(collection) {
      return collection.update({
        _id: record._id
      }, {
        $set: {
          status: STATUS_CODES.processed,
          processedDate: new Date()
        },
        $unset: {
          failureReason: '',
          retryCount: ''
        }
      });
    });
  }

  function processFailure(record, err) {
    return getCollection().then(function(collection) {
      return collection.update({
        _id: record._id
      }, {
        $set: {
          status: STATUS_CODES.failed,
          processedDate: new Date(),
          failureReason: err && err.stack || err
        },
        $inc: {
          retryCount: 1
        }
      });
    });
  }

  function notifyFailedRecord(record) {
    return Promise.resolve().then(function() {
      return onFailure(record);
    })
    .then(function() {
      return getCollection().then(function(collection) {
        return collection.update({
          _id: record._id
        }, {
          $set: {
            status: STATUS_CODES.notified,
            processedDate: new Date()
          }
        });
      });
    });
  }

};
