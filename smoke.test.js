'use strict'

var Promise = require('bluebird')
var sinon = require('sinon')
var expect = require('chai').expect
var mongoQueue = require('./index')

describe(__filename, function () {
  var COLLECTION_NAME = 'SMOKE_TEST_RECORDS'

  var db = require('./lib/db')(process.env.QUEUE_TEST_URL)

  function getDb () {
    return db.getCollection(COLLECTION_NAME)
  }

  function getAllRecords () {
    return getDb().then(function (c) {
      return c.find().toArray()
    })
  }

  function removeAll () {
    return getDb().call('remove')
  }

  beforeEach(removeAll)

  it('Should smoke test', function () {
    this.timeout(15000) // This thing could run for a little bit

    var processStub = sinon.stub().returns(Promise.resolve())

    var queue = mongoQueue({
      mongoUrl: process.env.QUEUE_TEST_URL,
      collectionName: COLLECTION_NAME,
      processCron: '*/5 * * * * *', // Every 5 seconds
      onProcess: processStub
    })

    queue.enqueue({
      foo: true
    })
    queue.enqueue({
      bar: true
    })

    // Wait long enough for it to process
    return Promise.delay(6000)
      .then(getAllRecords)
      .then(function (records) {
        expect(records.length).to.eql(2)
        expect(records[0].status).to.eql('processed')
        expect(records[1].status).to.eql('processed')

        expect(processStub.callCount).to.eql(2)
      })
      .then(function () {
        // Submit another record and make sure we process again
        return queue.enqueue({
          baz: true
        })
      })
      .then(function () {
        return Promise.delay(6000)
      })
      .then(getAllRecords)
      .then(function (records) {
        expect(records.length).to.eql(3)
        expect(records[0].status).to.eql('processed')
        expect(records[1].status).to.eql('processed')
        expect(records[2].status).to.eql('processed')

        expect(processStub.callCount).to.eql(3)
      })
  })
})
