import WebSocket from 'ws';

const guildId = '681156128847036488'; // from previous redis output
const wsUrl = `ws://localhost:3000/api/v1/player/ws/${guildId}?token=dummy`;

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('Connected!');
  
  // Wait a bit to see if we get initial state (we shouldn't, unless bot publishes)
  setTimeout(() => {
    console.log('Sending remove command...');
    ws.send(JSON.stringify({ action: 'remove', index: 0 }));
  }, 1000);
});

ws.on('message', (data) => {
  console.log('Received message:');
  console.log(data.toString());
  ws.close();
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});
