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

  const cleanPath = (p) => {
    if (!p) return '';
    // Strip query parameters
    let cleaned = p.split('?')[0];
    // Normalize consecutive slashes
    cleaned = cleaned.replace(/\/{2,}/g, '/');
    // Convert to lowercase and trim
    cleaned = cleaned.trim().toLowerCase();
    // Strip leading /api/ or api/
    cleaned = cleaned.replace(/^\/?api/, '');
    // Ensure leading slash
    if (!cleaned.startsWith('/')) {
      cleaned = '/' + cleaned;
    }
    // Strip trailing slash if any
    if (cleaned.endsWith('/') && cleaned.length > 1) {
      cleaned = cleaned.substring(0, cleaned.length - 1);
    }
    return cleaned;
  };

  const reqPathClean = cleanPath(req.path);
  const origPathClean = cleanPath(req.originalUrl);

  const isExempt = exemptPaths.some(p => {
    const cleanExempt = cleanPath(p);
    return reqPathClean === cleanExempt || origPathClean === cleanExempt;
  });

  if (isExempt) {
    return next();
  }

  const csrfCookie = req.cookies['XSRF-TOKEN'];
  // Support both standard XSRF and general CSRF custom header names
  const csrfHeader = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];

  const match = (csrfCookie && csrfHeader && csrfCookie === csrfHeader);

  // Print diagnostic log for all mutating requests
  const cookieNames = req.cookies ? Object.keys(req.cookies) : [];
  const userId = req.user ? req.user.id : 'N/A';
  console.log(`[CSRF DIAGNOSTIC] Method: ${req.method}, Path: ${req.path}, OriginalUrl: ${req.originalUrl}, reqPathClean: ${reqPathClean}, origPathClean: ${origPathClean}, CookieKeys: ${JSON.stringify(cookieNames)}, CookieVal: ${csrfCookie ? 'Present' : 'Missing'}, HeaderVal: ${csrfHeader ? 'Present' : 'Missing'}, Match: ${match ? 'Pass' : 'Mismatch'}, UserID: ${userId}`);

  if (!match) {
    console.warn(`[SECURITY] CSRF Validation Failed. IP: ${req.ip || 'Unknown'}, Path: ${req.path}, OriginalUrl: ${req.originalUrl}, Cookie: ${csrfCookie ? 'Present' : 'Missing'}, Header: ${csrfHeader ? 'Present' : 'Missing'}`);
    return res.status(403).json({
      success: false,
      message: 'CSRF Validation Failed'
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
    const isProduction = process.env.NODE_ENV === 'production';
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || isProduction ||
                     (req.headers.host && !req.headers.host.includes('localhost') && !req.headers.host.includes('127.0.0.1'));
    res.cookie('XSRF-TOKEN', token, {
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      httpOnly: false, // Must be accessible to client-side JS (important for cross-origin read)
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });
  }
  next();
};

module.exports = { csrfProtection, setCsrfToken };
