'use strict';

const Promise = require('bluebird');
const cmaster = require('cron-master');

// Creates a cron job from the given params and starts it.
// Returns a CronMasterJob.
exports.createJob = function(opts) {
  const job = new cmaster.CronMasterJob({
    // Some meta data to assist the job/logging
    meta: {
      name: opts.name
    },
    // The usual params that you pass to the "cron" module go here
    cronParams: {
      cronTime: opts.cron,
      onTick: function(job, callback) {
        return Promise.resolve()
          .then(opts.handlers.processTick)
          .catch(function(err) {
            console.log(err.stack);
          })
          .asCallback(callback);
      }
    }
  });

  initialiseJob(job);

  return Promise.fromCallback(function(cb) {
    job.start(cb);
  }).return(job);

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
  function initialiseJob(job) {
    job.on(cmaster.EVENTS.TICK_STARTED, wrapHandler(opts.handlers.tickStarted));
    job.on(cmaster.EVENTS.TICK_COMPLETE, wrapHandler(opts.handlers.tickComplete));
    job.on(cmaster.EVENTS.TIME_WARNING, wrapHandler(opts.handlers.timeWarning));
    job.on(cmaster.EVENTS.OVERLAPPING_CALL, wrapHandler(opts.handlers.overlappingCall));
  }
};
