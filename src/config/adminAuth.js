const { createHash, timingSafeEqual } = require('crypto');

module.exports = function adminAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(503).json({ success: false, message: 'Cau hinh ADMIN_PASSWORD de mo quan tri.' });
  const header = req.get('Authorization') || '';
  const supplied = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const hash = (value) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(supplied), hash(`admin:${password}`))) {
    res.set('WWW-Authenticate', 'Basic realm="Order Queue Admin", charset="UTF-8"');
    return res.status(401).json({ success: false, message: 'Can dang nhap quan tri.' });
  }
  // Reject cross-origin browser writes using cached Basic credentials.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('Origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ success: false, message: 'Origin khong hop le.' });
    }
  }
  next();
};
