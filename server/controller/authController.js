const AuthManager = require('../src/core/auth/AuthManager');
const UserService = require('../src/core/services/UserService');
const OAuthStrategy = require('../src/core/auth/strategies/OAuthStrategy');
const ActivityService = require('../src/core/services/ActivityService');

const REPLIT_DOMAIN = process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',')[0].trim() : null;
const BASE_URL = (process.env.BASE_URL || (REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : 'http://localhost:5000')).replace(/\/+$/, '');

const authManager = new AuthManager();
const userService = new UserService();

const oauthConfigs = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${BASE_URL}/api/auth/google/callback`,
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL || `${BASE_URL}/api/auth/github/callback`,
  },
};

const usedOAuthCodes = new Map();
const oauthStates = new Map();
const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
const OAUTH_CODE_PROCESSING_TTL_MS = 30 * 1000;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

function markOAuthCodeProcessing(code) {
  if (usedOAuthCodes.has(code)) return false;
  usedOAuthCodes.set(code, { status: 'processing', ts: Date.now() });
  setTimeout(() => {
    const v = usedOAuthCodes.get(code);
    if (v && v.status === 'processing') usedOAuthCodes.delete(code);
  }, OAUTH_CODE_PROCESSING_TTL_MS);
  return true;
}

function finalizeOAuthCodeUsed(code) {
  usedOAuthCodes.set(code, { status: 'used', ts: Date.now() });
  setTimeout(() => usedOAuthCodes.delete(code), OAUTH_CODE_TTL_MS);
}

function clearOAuthCode(code) {
  if (usedOAuthCodes.has(code)) usedOAuthCodes.delete(code);
}

function storeOAuthState(state) {
  oauthStates.set(state, Date.now());
  setTimeout(() => oauthStates.delete(state), OAUTH_STATE_TTL_MS);
}

function consumeOAuthState(state) {
  if (!oauthStates.has(state)) return false;
  oauthStates.delete(state);
  return true;
}

function getPrimaryClientUrl() {
  if (process.env.CLIENT_URL) {
    const urls = process.env.CLIENT_URL.split(',').map((url) => url.trim());
    return urls[0];
  }
  if (process.env.CLIENT_USER) {
    return `http://localhost:${process.env.CLIENT_USER}`;
  }
  return 'http://localhost:5173';
}

function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  };
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

function csrfCookieOptions() {
  return {
    httpOnly: false, // Must be accessible to client-side JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  return req.cookies?.access_token || bearerToken || null;
}

class AuthController {
  async googleAuth(req, res) {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const state = Math.random().toString(36).slice(2);

    const options = {
      redirect_uri: oauthConfigs.google.callbackUrl,
      client_id: oauthConfigs.google.clientId,
      access_type: 'offline',
      response_type: 'code',
      prompt: 'consent',
      scope: ['openid', 'email', 'profile'].join(' '),
      state,
    };

    storeOAuthState(state);
    return res.redirect(`${rootUrl}?${new URLSearchParams(options).toString()}`);
  }

  async githubAuth(req, res) {
    const rootUrl = 'https://github.com/login/oauth/authorize';
    const state = Math.random().toString(36).slice(2);
    storeOAuthState(state);

    const options = {
      client_id: oauthConfigs.github.clientId,
      redirect_uri: oauthConfigs.github.callbackUrl,
      scope: 'user:email',
      state,
    };

    return res.redirect(`${rootUrl}?${new URLSearchParams(options).toString()}`);
  }

  async googleCallback(req, res) {
    try {
      const { code, state } = req.query;
      const clientUrl = getPrimaryClientUrl();

      if (!code) {
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent('Missing Google OAuth code')}`);
      }
      if (!state || !consumeOAuthState(state)) {
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent('Invalid OAuth state')}`);
      }
      if (!markOAuthCodeProcessing(code)) {
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent('OAuth code already used')}`);
      }

      const oauthStrategy = new OAuthStrategy('google', oauthConfigs.google);
      try {
        const profile = await oauthStrategy.getProfileFromCode(code);
        const { user } = await userService.upsertBySocialProfile('google', profile);
        
        const accessToken = authManager.generateToken(user, 'access');
        const refreshToken = authManager.generateToken(user, 'refresh');

        await userService.createSession(user.id, {
          token: refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        });

        const crypto = require('crypto');
        const csrfToken = crypto.randomBytes(24).toString('hex');

        finalizeOAuthCodeUsed(code);
        await ActivityService.log(user.id, 'Login Success', 'Logged in via Google', req.ip);

        res.cookie('access_token', accessToken, accessCookieOptions());
        res.cookie('refresh_token', refreshToken, refreshCookieOptions());
        res.cookie('XSRF-TOKEN', csrfToken, csrfCookieOptions());
        return res.redirect(`${clientUrl}/dashboard`);
      } catch (err) {
        clearOAuthCode(code);
        throw err;
      }
    } catch (error) {
      const clientUrl = getPrimaryClientUrl();
      return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent(error.message)}`);
    }
  }

  async githubCallback(req, res) {
    try {
      const { code, state } = req.query;
      const clientUrl = getPrimaryClientUrl();

      if (!code) {
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent('Missing GitHub OAuth code')}`);
      }
      if (!state || !consumeOAuthState(state)) {
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent('Invalid OAuth state')}`);
      }
      if (!markOAuthCodeProcessing(code)) {
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent('OAuth code already used')}`);
      }

      const oauthStrategy = new OAuthStrategy('github', oauthConfigs.github);
      try {
        const profile = await oauthStrategy.getProfileFromCode(code);
        const { user } = await userService.upsertBySocialProfile('github', profile);
        
        const accessToken = authManager.generateToken(user, 'access');
        const refreshToken = authManager.generateToken(user, 'refresh');

        await userService.createSession(user.id, {
          token: refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ipAddress: req.ip || null,
          userAgent: req.headers['user-agent'] || null,
        });

        const crypto = require('crypto');
        const csrfToken = crypto.randomBytes(24).toString('hex');

        finalizeOAuthCodeUsed(code);
        await ActivityService.log(user.id, 'Login Success', 'Logged in via GitHub', req.ip);

        res.cookie('access_token', accessToken, accessCookieOptions());
        res.cookie('refresh_token', refreshToken, refreshCookieOptions());
        res.cookie('XSRF-TOKEN', csrfToken, csrfCookieOptions());
        return res.redirect(`${clientUrl}/dashboard`);
      } catch (err) {
        clearOAuthCode(code);
        throw err;
      }
    } catch (error) {
      const clientUrl = getPrimaryClientUrl();
      return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent(error.message)}`);
    }
  }

  async refresh(req, res) {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (!refreshToken) {
        return res.status(401).json({ success: false, message: 'Refresh token required' });
      }

      let decoded;
      try {
        decoded = authManager.verifyToken(refreshToken);
      } catch (err) {
        res.clearCookie('access_token', { ...accessCookieOptions(), maxAge: undefined });
        res.clearCookie('refresh_token', { ...refreshCookieOptions(), maxAge: undefined });
        res.clearCookie('XSRF-TOKEN', { ...csrfCookieOptions(), maxAge: undefined });
        return res.status(401).json({ success: false, message: 'Session expired' });
      }

      if (decoded.type !== 'refresh') {
        return res.status(401).json({ success: false, message: 'Invalid token type' });
      }

      const { prisma } = require('../utils/dbConnector');
      const session = await prisma.session.findUnique({
        where: { token: refreshToken }
      });

      if (!session || session.expiresAt < new Date()) {
        if (session) {
          await prisma.session.delete({ where: { token: refreshToken } }).catch(() => {});
        }
        res.clearCookie('access_token', { ...accessCookieOptions(), maxAge: undefined });
        res.clearCookie('refresh_token', { ...refreshCookieOptions(), maxAge: undefined });
        res.clearCookie('XSRF-TOKEN', { ...csrfCookieOptions(), maxAge: undefined });
        return res.status(401).json({ success: false, message: 'Session invalid or expired' });
      }

      const user = await userService.findById(decoded.id);
      if (!user || !user.isActive) {
        res.clearCookie('access_token', { ...accessCookieOptions(), maxAge: undefined });
        res.clearCookie('refresh_token', { ...refreshCookieOptions(), maxAge: undefined });
        res.clearCookie('XSRF-TOKEN', { ...csrfCookieOptions(), maxAge: undefined });
        return res.status(401).json({ success: false, message: 'User suspended or not found' });
      }

      // 4. Token Rotation: generate new keys
      const newAccessToken = authManager.generateToken(user, 'access');
      const newRefreshToken = authManager.generateToken(user, 'refresh');

      // Swap database sessions
      await prisma.session.delete({ where: { token: refreshToken } }).catch(() => {});
      await userService.createSession(user.id, {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });

      res.cookie('access_token', newAccessToken, accessCookieOptions());
      res.cookie('refresh_token', newRefreshToken, refreshCookieOptions());
      return res.status(200).json({ success: true, message: 'Token refreshed successfully' });
    } catch (error) {
      console.error('Session refresh error:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to refresh token' });
    }
  }

  async logout(req, res) {
    try {
      const refreshToken = req.cookies?.refresh_token;
      if (refreshToken) {
        await userService.deleteSession(refreshToken);
      }
      res.clearCookie('access_token', { ...accessCookieOptions(), maxAge: undefined });
      res.clearCookie('refresh_token', { ...refreshCookieOptions(), maxAge: undefined });
      res.clearCookie('XSRF-TOKEN', { ...csrfCookieOptions(), maxAge: undefined });
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to logout' });
    }
  }

  async getProfile(req, res) {
    try {
      const user = await userService.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          profileImage: user.profileImage,
          role: user.role,
          authProvider: user.authProvider,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          bio: user.bio,
          gender: user.gender,
          age: user.age,
          phone: user.phone,
          location: user.location,
          country: user.country,
          dob: user.dob,
          isActive: user.isActive,
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
  }
}

module.exports = new AuthController();