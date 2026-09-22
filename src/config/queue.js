const { Queue } = require('bullmq');

const connection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379'
};

const capiQueue = new Queue('meta-capi-events', { connection });

module.exports = {
  connection,
  capiQueue
};
