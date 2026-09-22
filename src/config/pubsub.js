const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Connection for publishing
const pub = new Redis(redisUrl);

// We don't export a single sub because each SSE connection will need its own subscriber,
// or we can use a singleton subscriber that fans out internally using EventEmitter.
// Fanning out via EventEmitter is much more efficient than one Redis connection per client.
const sub = new Redis(redisUrl);
const EventEmitter = require('events');
const pubsubEmitter = new EventEmitter();

sub.on('message', (channel, message) => {
    pubsubEmitter.emit(channel, message);
});

// Utility to publish
async function publishDashboardUpdate(tenantId) {
    await pub.publish(`DASHBOARD_UPDATE:${tenantId}`, 'update');
}

// Utility to subscribe
function subscribeDashboard(tenantId, callback) {
    const channel = `DASHBOARD_UPDATE:${tenantId}`;
    
    // Tell Redis to subscribe to this channel if we haven't already
    if (pubsubEmitter.listenerCount(channel) === 0) {
        sub.subscribe(channel);
    }
    
    pubsubEmitter.on(channel, callback);
    
    // Return unsubscribe function
    return () => {
        pubsubEmitter.removeListener(channel, callback);
        if (pubsubEmitter.listenerCount(channel) === 0) {
            sub.unsubscribe(channel);
        }
    };
}

module.exports = {
    publishDashboardUpdate,
    subscribeDashboard
};
