'use strict';

const Promise = require('bluebird');
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;

module.exports = function(mongoUrl) {
  const dbPromise = MongoClient.connect(mongoUrl);

  return {
    getCollection: getCollection,
    ObjectID: mongodb.ObjectID
  };

  // Returns a BLUEBIRD promise for the collection.
  // Note that by starting any chain with this promise, that will assure that
  // all other promises in the chain will also be BLUEBIRD promises
  function getCollection(collectionName) {
    return Promise.resolve(dbPromise).then(function(db) {
      return db.collection(collectionName);
    });
  }
};
