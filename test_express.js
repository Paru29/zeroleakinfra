const express = require('express');
const app = express();

app.use((req, res, next) => {
  if (req.path === '/admin') return next('route');
  next();
}, (req, res, next) => {
  console.log("This is static");
  next();
});

app.use('/admin', (req, res) => {
  console.log("This is protect");
  res.send('protected');
});

const req = { url: '/admin', method: 'GET' };
const res = { send: (msg) => console.log("SENT:", msg) };
app.handle(req, res);
