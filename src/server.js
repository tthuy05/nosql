const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const apiRouter = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Phuc vu cac tep tinh Frontend (HTML, CSS, JS, Assets)
app.use(express.static(path.join(__dirname, 'public')));

// Dang ky API Router
app.use('/api', apiRouter);

// Route trang chu khach hang
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route trang quan tri Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Khoi chay HTTP Server
const server = app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🌐 [Web Server] Ung dung Web Redis Order Queue dang hoat dong!`);
  console.log(`🛒 Trang Khach Hang: http://localhost:${PORT}`);
  console.log(`📊 Dashboard Quan Tri: http://localhost:${PORT}/admin`);
  console.log(`🔍 P3X Redis UI: http://localhost:7843 (hoac chay desktop app)`);
  console.log(`================================================================`);
});

// Xu ly dong server an toan
function gracefulShutdown(signal) {
  console.log(`\n🛑 [Web Server] Nhan tin hieu ${signal}, dang dong server...`);
  server.close(() => {
    console.log('✅ [Web Server] Da dong cong ket noi HTTP.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = app;
