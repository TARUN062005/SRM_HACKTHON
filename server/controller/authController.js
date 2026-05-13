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

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
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
        const token = authManager.generateToken(user);

        await userService.createSession(user.id, {
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        finalizeOAuthCodeUsed(code);
        await ActivityService.log(user.id, 'Login Success', 'Logged in via Google', req.ip);

        res.cookie('access_token', token, authCookieOptions());
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
        const token = authManager.generateToken(user);

        await userService.createSession(user.id, {
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        finalizeOAuthCodeUsed(code);
        await ActivityService.log(user.id, 'Login Success', 'Logged in via GitHub', req.ip);

        res.cookie('access_token', token, authCookieOptions());
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

  async logout(req, res) {
    try {
      const token = extractToken(req);
      if (token) {
        await userService.deleteSession(token);
      }
      res.clearCookie('access_token', { ...authCookieOptions(), maxAge: undefined });
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