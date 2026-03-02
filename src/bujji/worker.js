// src/bujji/worker.js
const { Queue, Worker } = require('bullmq');
const connection = { connection: { url: process.env.REDIS_URL } };
const queue = new Queue('bujji', connection);

const worker = new Worker('bujji', async job => {
  const { type, payload } = job.data;
  if (type === 'bujjiEvent') {
    // process event (update DB, notify users)
  } else if (type === 'retryAction') {
    // call API client to reattempt
  }
}, connection);

worker.on('failed', (job, err) => {
  console.error('job failed', job.id, err);
});

module.exports = { queue, worker };
