#!/usr/bin/env node

const { connect } = require('nats');

async function checkStream() {
  console.log('Connecting to NATS...');

  const nc = await connect({
    servers: 'nats://localhost:4222',
  });

  console.log('Connected!\n');

  const jsm = await nc.jetstreamManager();

  try {
    const streams = await jsm.streams.list().next();
    console.log('Available JetStream streams:');
    console.log('='.repeat(50));

    for await (const stream of streams) {
      console.log(`\nStream: ${stream.config.name}`);
      console.log(`  Subjects: ${stream.config.subjects.join(', ')}`);
      console.log(`  Messages: ${stream.state.messages}`);
      console.log(`  Bytes: ${stream.state.bytes}`);
      console.log(`  Storage: ${stream.config.storage}`);
      console.log(`  Consumers: ${stream.state.consumer_count}`);
    }
    console.log('\n' + '='.repeat(50));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await nc.close();
  }
}

checkStream()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
