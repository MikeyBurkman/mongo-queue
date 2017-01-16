'use strict'

var proxyquire = require('proxyquire')
var expect = require('chai').expect
var sinon = require('sinon')

require('sinon-as-promised')(require('bluebird'))

describe(__filename, function () {
  var mod, collectionStub

  beforeEach(function () {
    collectionStub = sinon.stub().resolves({})

    mod = proxyquire('./db.js', {
      mongodb: {
        MongoClient: {
          connect: sinon.stub().resolves({
            collection: collectionStub
          })
        }
      }
    })('dummyUrl')
  })

  describe('#getCollection', function () {
    it('should return a collection', function () {
      return mod.getCollection('hello')
        .then(function (collection) {
          expect(collection).to.be.an('object')
          expect(collectionStub.calledWith('hello')).to.be.true
        })
    })
  })
})
