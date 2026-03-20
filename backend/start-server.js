// Keep-alive server starter
require('dotenv').config();
const app = require('./src/server');

// Keep the process alive
process.on('SIGINT', () => {
    console.log('Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down...');
    process.exit(0);
});

// Keep process running
setInterval(() => {}, 1000);
