'use strict';

var Promise = require('bluebird');
var cmaster = require('cron-master');

// Creates a cron job from the given params and starts it.
// Returns a CronMasterJob.
exports.createJob = function(opts) {
  var name = opts.name;
  var cron = opts.cron;
  var handlers = opts.handlers || {};

  var job = new cmaster.CronMasterJob({
    // Some meta data to assist the job/logging
    meta: {
      name: name
    },
    // The usual params that you pass to the "cron" module go here
    cronParams: {
      cronTime: cron,
      onTick: wrapHandler(handlers.processTick)
    }
  });

  initialiseJob(job, handlers);
  return Promise.fromCallback(function(cb) {
    job.start(cb);
  })
  .return(job);

  function wrapHandler(fn) {
    if (fn) {
      return fn.bind(null, job);
    } else {
      return function() {};
    }
  }

  /**
   * intialize cron job events such as start, complete, time warning and overlapping, etc
   * @param job
   */
  function initialiseJob(job, handlers) {
    job.on(cmaster.EVENTS.TICK_STARTED, wrapHandler(handlers.tickStarted));
    job.on(cmaster.EVENTS.TICK_COMPLETE, wrapHandler(handlers.tickComplete));
    job.on(cmaster.EVENTS.TIME_WARNING, wrapHandler(handlers.timeWarning));
    job.on(cmaster.EVENTS.OVERLAPPING_CALL, wrapHandler(handlers.overlappingCall));
  }
};


