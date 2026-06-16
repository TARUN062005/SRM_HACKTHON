const crypto = require('crypto');

/**
 * csrfProtection: Middleware to validate XSRF-TOKEN cookie against the custom X-XSRF-TOKEN header.
 */
const csrfProtection = (req, res, next) => {
  // Safe HTTP methods do not require CSRF protection
  const safeMethods = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Exempt public auth, session control, background heartbeat & warmup endpoints from CSRF
  const exemptPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/verify-email',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/refresh',
    '/auth/logout',
    '/user/active-ping',
    '/ai/warmup'
  ];

  const path = req.path;
  const originalPath = req.originalUrl.split('?')[0];

  const isExempt = exemptPaths.some(p => path === p || originalPath === p || originalPath === `/api${p}`);
  if (isExempt) {
    return next();
  }

  const csrfCookie = req.cookies['XSRF-TOKEN'];
  // Support both standard XSRF and general CSRF custom header names
  const csrfHeader = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];

  // Diagnostics for AI routes only
  const isAiRoute = req.path.startsWith('/ai') || req.path.startsWith('/api/ai') || req.originalUrl.includes('/ai/');
  if (isAiRoute) {
    const cookieNames = req.cookies ? Object.keys(req.cookies) : [];
    const userId = req.user ? req.user.id : 'N/A';
    const match = (csrfCookie && csrfHeader && csrfCookie === csrfHeader) ? 'Match' : 'Mismatch';
    const resultStatus = match === 'Match' ? 'Pass' : '403 Forbidden';
    console.log(`[CSRF DIAGNOSTIC] Path: ${req.path}, OriginalUrl: ${req.originalUrl}, CookieKeys: ${JSON.stringify(cookieNames)}, CookieVal: ${csrfCookie ? 'Present' : 'Missing'}, HeaderVal: ${csrfHeader ? 'Present' : 'Missing'}, Status: ${match}, UserID: ${userId}, Result: ${resultStatus}`);
  }

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    console.warn(`[SECURITY] CSRF Validation Failed. IP: ${req.ip || 'Unknown'}, Path: ${req.path}`);
    return res.status(403).json({
      success: false,
      message: 'CSRF validation failed'
    });
  }

  next();
};

/**
 * setCsrfToken: Generates and sets a new XSRF-TOKEN cookie if it is missing.
 */
const setCsrfToken = (req, res, next) => {
  if (!req.cookies['XSRF-TOKEN']) {
    const token = crypto.randomBytes(24).toString('hex');
    const host = req.headers.host || '';
    const isProduction = process.env.NODE_ENV === 'production' || (!host.includes('localhost') && !host.includes('127.0.0.1'));
    res.cookie('XSRF-TOKEN', token, {
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });
  }
  next();
};

module.exports = { csrfProtection, setCsrfToken };
