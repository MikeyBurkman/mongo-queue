'use strict';

// Handles creating a retry queue, and then setting up cron jobs to call it

var retryQueue = require('./lib/queue');
var retryQueueCron = require('./lib/cron');
var utils = require('./lib/utils');

module.exports = function mongoQueue(opts) {

  var queue = retryQueue({
    mongoUrl: opts.mongoUrl,
    collectionName: opts.collectionName,
    batchSize: opts.batchSize,
    maxRecordAge: opts.maxRecordAge,
    onProcess: opts.onProcess,
    onFailure: opts.onFailure,
    retryLimit: opts.retryLimit,
    backoffMs: opts.backoffMs,
    backoffCoefficient: opts.backoffCoefficient,
    conditionFn: opts.conditionFn
  });

  var processCronJob = retryQueueCron.createJob({
    name: opts.collectionName + '-process',
    cron: opts.processCron,
    fn: queue.processNextBatch
  });

  var cleanupCronJob = retryQueueCron.createJob({
    name: opts.collectionName + '-cleanup',
    cron: opts.cleanupCron,
    fn: queue.cleanup
  });

  return {
    enqueue: queue.enqueue,
    processNextBatch: processCronJob.run,
    cleanup: cleanupCronJob.run
  };

};

module.exports.skip = utils.skip;
module.exports.fail = utils.fail;
