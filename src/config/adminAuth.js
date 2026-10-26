const { createHash, timingSafeEqual } = require('crypto');

function getCookie(req, name) {
  const header = (typeof req.get === 'function' ? req.get('Cookie') : (req.headers && req.headers.cookie)) || '';
  const match = header.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = function adminAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(503).json({ success: false, message: 'Cau hinh ADMIN_PASSWORD de mo quan tri.' });

  const hash = (value) => createHash('sha256').update(value).digest();
  const expectedHash = hash(`admin:${password}`);
  const expectedToken = createHash('sha256').update(`admin:${password}`).digest('hex');

  let authenticated = false;

  // 1. Check HTTP Basic Authorization header (used by curl, automated test suites)
  const header = typeof req.get === 'function' ? (req.get('Authorization') || '') : '';
  if (header.startsWith('Basic ')) {
    const supplied = Buffer.from(header.slice(6), 'base64').toString('utf8');
    if (timingSafeEqual(hash(supplied), expectedHash)) {
      authenticated = true;
    }
  }

  // 2. Check Cookie admin_session (used by browser web dashboard)
  if (!authenticated) {
    const cookieToken = getCookie(req, 'admin_session');
    if (cookieToken) {
      if (timingSafeEqual(hash(cookieToken), hash(expectedToken))) {
        authenticated = true;
      }
    }
  }

  // If authenticated, check CSRF protection for write methods
  if (authenticated) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = typeof req.get === 'function' ? req.get('Origin') : undefined;
      const host = typeof req.get === 'function' ? req.get('host') : undefined;
      if (origin && origin !== `${req.protocol}://${host}`) {
        return res.status(403).json({ success: false, message: 'Origin khong hop le.' });
      }
    }
    return next();
  }

  // If not authenticated:
  // If browser is accessing the admin webpage (/admin or /admin.html), redirect to /login
  const fullUrl = req.originalUrl || req.url || '';
  if ((fullUrl === '/admin' || fullUrl.startsWith('/admin?') || fullUrl === '/admin.html') && typeof res.redirect === 'function') {
    return res.redirect('/login');
  }

  // Otherwise return 401 for API / automation
  res.set('WWW-Authenticate', 'Basic realm="Order Queue Admin", charset="UTF-8"');
  return res.status(401).json({ success: false, message: 'Can dang nhap quan tri.' });
};
