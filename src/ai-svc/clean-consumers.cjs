#!/usr/bin/env node

const { connect } = require('nats');

async function cleanConsumers() {
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  console.log('Connecting to NATS...');
  const nc = await connect({ servers: natsUrl });
  console.log('Connected to NATS!');

  const jsm = await nc.jetstreamManager();

  try {
    // List all consumers
    const consumers = await jsm.consumers.list('ai-pubsub').next();
    console.log('\nDeleting consumers...');
    for await (const consumer of consumers) {
      console.log(`  Deleting: ${consumer.name}`);
      await jsm.consumers.delete('ai-pubsub', consumer.name);
      console.log(`  ✓ Deleted: ${consumer.name}`);
    }
    console.log('\nAll consumers deleted!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await nc.close();
  }
}

cleanConsumers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
