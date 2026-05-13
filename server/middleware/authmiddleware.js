const jwt = require('jsonwebtoken');
const { prisma } = require('../utils/dbConnector');

const JWT_SECRET = process.env.JWT_SECRET;

function getTokenFromRequest(req) {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  return req.cookies?.access_token || bearerToken || null;
}

/**
 * verifyToken: Main protection for user routes
 * - Validates JWT
 * - Fetches user from DB for REAL status checks (isActive, role)
 * - Blocks suspended accounts even if token is old
 */
const verifyToken = async (req, res, next) => {
  try {
    if (!JWT_SECRET) {
      console.error('SECURITY CRITICAL: JWT_SECRET is not defined in environment variables.');
      return res.status(500).json({
        success: false,
        message: 'Internal server configuration error'
      });
    }

    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // 1) Decode token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload'
      });
    }

    // 2) Fetch user from DB (source of truth)
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        role: true,
        email: true,
        authProvider: true,
        isActive: true,
        emailVerified: true,
        phoneVerified: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found for this token'
      });
    }

    // 3) Block suspended accounts always
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account suspended. Please reactivate via email.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // 4) Attach safe + full auth identity
    req.user = {
      id: user.id,
      role: user.role,
      email: user.email,
      authProvider: user.authProvider,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
};

/**
 * isAdmin: Restricts routes to admin users only
 */
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

/**
 * optionalAuth: Identifies user if token exists, but doesn't block if it doesn't
 * - DOES NOT query DB (fast)
 * - Use only for optional features like showing "logged in" UI on landing pages
 */
const optionalAuth = (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (token && JWT_SECRET) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = {
  verifyToken,
  isAdmin,
  optionalAuth
};
