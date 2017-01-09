
var uuid = require('node-uuid').v4();

exports.skip = function(backoffMs) {
  return {
    '_@@skip': uuid,
    backoffMs: backoffMs || 0
  };
};

exports.isSkip = function(err) {
  return err['_@@skip'] === uuid;
};

exports.getBackoff = function(skipErr) {
  return skipErr.backoffMs;
};
