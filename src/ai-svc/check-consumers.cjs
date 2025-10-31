#!/usr/bin/env node

const { connect } = require('nats');

async function checkConsumers() {
  const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';

  console.log('Connecting to NATS...');
  const nc = await connect({ servers: natsUrl });
  console.log('Connected to NATS!');

  const jsm = await nc.jetstreamManager();

  try {
    const streamInfo = await jsm.streams.info('ai-pubsub');
    console.log('\nStream: ai-pubsub');
    console.log('Subjects:', streamInfo.config.subjects);
    console.log('Consumers:', streamInfo.state.consumer_count);

    // List all consumers
    const consumers = await jsm.consumers.list('ai-pubsub').next();
    console.log('\nConsumers in stream:');
    for await (const consumer of consumers) {
      console.log(`\n  Name: ${consumer.name}`);
      console.log(`  Durable: ${consumer.config.durable_name}`);
      console.log(`  Filter Subject: ${consumer.config.filter_subject || 'all'}`);
      console.log(`  Ack Policy: ${consumer.config.ack_policy}`);
      console.log(`  Num Pending: ${consumer.num_pending}`);
      console.log(`  Num Redelivered: ${consumer.num_redelivered}`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await nc.close();
  }
}

checkConsumers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
