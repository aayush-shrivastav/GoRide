const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

/**
 * Starts an in-memory MongoDB instance for integration tests.
 * NOTE: mongodb-memory-server downloads a MongoDB binary on first run,
 * which requires network access. In fully offline CI/sandbox
 * environments this setup will fail to start — see README "Testing"
 * for how to point it at a local mongod instead via MONGOMS_SYSTEM_BINARY.
 */
async function connect() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
}

async function closeDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

module.exports = { connect, closeDatabase, clearDatabase };
