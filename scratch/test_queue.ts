import { QueueManager } from '../../apps/bot/src/music/QueueManager';

const q = new QueueManager();
q.add({ title: 'A' } as any);
q.add({ title: 'B' } as any);
q.add({ title: 'C' } as any);

console.log('Before remove:', q.tracks.length);
q.remove(1);
console.log('After remove 1:', q.tracks.length);
console.log(q.tracks.map(t => t.title));
