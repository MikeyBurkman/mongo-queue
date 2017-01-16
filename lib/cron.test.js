'use strict'

var proxyquire = require('proxyquire')
var expect = require('chai').expect
var sinon = require('sinon')

describe(__filename, function () {
  var jobStub, stubs, mod

  beforeEach(function () {
    jobStub = {
      meta: {},
      on: sinon.spy(),
      start: sinon.stub().yields(null)
    }

    var StubJobClass = sinon.stub(
      require('cron-master'),
      'CronMasterJob'
    ).returns(jobStub)

    stubs = {
      'cron-master': {
        CronMasterJob: StubJobClass
      },
      'lib/cron/cron-handlers': {
        processTick: sinon.spy(),
        tickStarted: sinon.spy(),
        tickComplete: sinon.spy(),
        timeWarning: sinon.spy(),
        overlappingCall: sinon.spy()
      }
    }

    mod = proxyquire('./cron', stubs)
  })

  describe('#createJob', function () {
    it('should start and return a job', function () {
      var fn = sinon.spy()
      var params = {
        name: 'a-str',
        cron: 'b-str',
        fn: fn
      }

      jobStub.meta.name = params.name

      return mod.createJob(params)
        .then(function (job) {
          expect(job).to.exist
          expect(jobStub.on.callCount).to.equal(4)
          expect(jobStub.start.called).to.be.true
        })
    })
  })
})
