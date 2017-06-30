'use strict';

// Skipping records
exports.skip = function(backoffMs) {
  var o = {
    backoffMs: backoffMs || 0
  };
  o[getSymbol('skip')] = true;
  return o;
};

exports.isSkip = function(err) {
  return err[getSymbol('skip')];
};

exports.getSkipBackoff = function(skipErr) {
  return skipErr.backoffMs;
};

// Failing records
exports.fail = function(reason) {
  var o = {
    reason: reason
  };
  o[getSymbol('fail')] = true;
  return o;
};

exports.isFail = function(err) {
  return !!err[getSymbol('fail')];
};

exports.getFailReason = function(failErr) {
  return failErr.reason;
};

// Internal Stuff

// Basically a symbol
function getSymbol(name) {
  return '_@mongo-queue-' + name;
}
