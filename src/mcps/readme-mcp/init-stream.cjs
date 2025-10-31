#!/usr/bin/env node

const { connect } = require('nats');

async function initStream() {
  // Allow NATS URL to be configured via environment variable or command line argument
  const natsUrl = process.env.NATS_URL || process.argv[2] || 'nats://localhost:4222';

  console.log('Connecting to NATS...');
  console.log(`NATS URL: ${natsUrl}`);

  const nc = await connect({
    servers: natsUrl,
    maxReconnectAttempts: 10,
    reconnectTimeWait: 1000,
  });

  console.log('Connected to NATS!');

  const jsm = await nc.jetstreamManager();

  const streamConfig = {
    name: 'ai-pubsub',
    subjects: ['ai-stream', 'ai-stream-responses', 'mcp-tool-requests', 'mcp-tool-responses'],
    retention: 'limits',
    storage: 'file',
    discard: 'old',
    max_consumers: -1,
    max_msgs: -1,
    max_bytes: -1,
    max_age: 0,
    max_msg_size: -1,
    num_replicas: 1,
    duplicate_window: 120_000_000_000,
  };

  try {
    // Check if stream exists
    try {
      const existingStream = await jsm.streams.info('ai-pubsub');
      console.log('Stream already exists:', existingStream.config.name);
      console.log('Subjects:', existingStream.config.subjects);
    } catch (err) {
      // Stream doesn't exist, create it
      console.log('Creating stream: ai-pubsub');
      console.log('Subjects:', streamConfig.subjects);
      await jsm.streams.add(streamConfig);
      console.log('Stream created successfully!');
    }

    // List all streams
    const streams = await jsm.streams.list().next();
    console.log('\nAvailable streams:');
    for await (const stream of streams) {
      console.log(`  - ${stream.config.name} (subjects: ${stream.config.subjects.join(', ')})`);
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await nc.close();
  }

  console.log('\nStream initialization complete!');
}

initStream()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
