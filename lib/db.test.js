'use strict';

const proxyquire = require('proxyquire');
const expect = require('expect');
const sinon = require('sinon');

require('sinon-as-promised')(require('bluebird'));

describe(__filename, function() {
  let mod, collectionStub;

  beforeEach(function() {
    collectionStub = sinon.stub().resolves({});

    mod = proxyquire('./db.js', {
      mongodb: {
        MongoClient: {
          connect: sinon.stub().resolves({
            collection: collectionStub
          })
        }
      }
    })('dummyUrl');
  });

  describe('#getCollection', function() {
    it('should return a collection', function() {
      return mod.getCollection('hello').then(function(collection) {
        expect(collection).toBeAn('object');
        expect(collectionStub.calledWith('hello')).toBeTruthy();
      });
    });
  });
});
