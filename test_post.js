fetch('http://localhost:3000/api/client-log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '[RECOVERY TEST] fetch test' })
}).then(r => console.log(r.status));
