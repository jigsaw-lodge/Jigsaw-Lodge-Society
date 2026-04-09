const { createClient } = require('redis');
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

async function main() {
  const subs = [];
  for (let i = 0; i < 10; i += 1) {
    const client = createClient({ url: REDIS_URL });
    client.on('error', (err) => console.error('client error', i, err));
    await client.connect();
    await client.subscribe('events_channel', () => {});
    subs.push(client);
  }

  const admin = createClient({ url: REDIS_URL });
  await admin.connect();
  const numsub = await admin.sendCommand(['PUBSUB', 'NUMSUB', 'events_channel']);
  const info = await admin.sendCommand(['INFO', 'stats']);
  console.log('pubsub numsub', numsub);
  for (const line of info.split('\n')) {
    if (line.startsWith('instantaneous_ops_per_sec:')) {
      console.log(line);
      break;
    }
  }
  await admin.disconnect();

  for (const client of subs) {
    await client.unsubscribe('events_channel');
    await client.quit();
  }
}

main().catch((err) => {
  console.error('main error', err);
  process.exit(1);
});
