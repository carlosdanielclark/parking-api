const { Client } = require('pg');
const { MongoClient } = require('mongodb');

async function waitForPostgres() {
  const client = new Client({
    host: 'localhost',
    port: 5433,
    user: 'test_user',
    password: 'test_password',
    database: 'parking_test_db',
  });

  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      await client.connect();
      console.log('✅ PostgreSQL test database is ready');
      await client.end();
      return;
    } catch (error) {
      attempts++;
      console.log(`⏳ Waiting for PostgreSQL... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('PostgreSQL test database not ready');
}

async function waitForMongo() {
  const uri = 'mongodb://test_mongo_user:test_mongo_password@localhost:27018/parking_logs_test?authSource=admin';
  
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const client = new MongoClient(uri);
      await client.connect();
      console.log('✅ MongoDB test database is ready');
      await client.close();
      return;
    } catch (error) {
      attempts++;
      console.log(`⏳ Waiting for MongoDB... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('MongoDB test database not ready');
}

async function main() {
  try {
    await Promise.all([waitForPostgres(), waitForMongo()]);
    console.log('🚀 All test databases are ready!');
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

main();