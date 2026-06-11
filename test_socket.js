const io = require('socket.io-client');
const socket = io('http://localhost:3001');
socket.on('connect_error', (err) => console.log('Error:', err.message));
socket.on('connect', () => console.log('Connected!'));
setTimeout(() => process.exit(0), 3000);
