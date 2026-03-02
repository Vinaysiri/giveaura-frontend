// src/bujji/cronTasks.js
const cron = require('node-cron');
const { queue } = require('./worker');

// run every 5 minutes: check stuck actions
cron.schedule('*/5 * * * *', async () => {
  await queue.add('bujjiCheck', { type: 'checkStuck' });
});
