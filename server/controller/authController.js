const AuthManager = require('../src/core/auth/AuthManager');
const UserService = require('../src/core/services/UserService');
const OAuthStrategy = require('../src/core/auth/strategies/OAuthStrategy');
const ActivityService = require('../src/core/services/ActivityService');
const bcrypt = require('bcryptjs');

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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  };
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  };
}

function csrfCookieOptions() {
  return {
    httpOnly: false, // Must be accessible to client-side JS
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
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

        // Trigger server-side background warmup for GeoRiskEngine
        try {
          const GeoRiskWarmupService = require('../services/GeoRiskWarmupService');
          GeoRiskWarmupService.triggerWarmup();
        } catch (warmupErr) {
          console.warn('[Warmup] Failed to trigger GeoRisk warmup in googleCallback:', warmupErr.message);
        }

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

        // Trigger server-side background warmup for GeoRiskEngine
        try {
          const GeoRiskWarmupService = require('../services/GeoRiskWarmupService');
          GeoRiskWarmupService.triggerWarmup();
        } catch (warmupErr) {
          console.warn('[Warmup] Failed to trigger GeoRisk warmup in githubCallback:', warmupErr.message);
        }

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

      // Trigger server-side background warmup for GeoRiskEngine
      try {
        const GeoRiskWarmupService = require('../services/GeoRiskWarmupService');
        GeoRiskWarmupService.triggerWarmup();
      } catch (warmupErr) {
        console.warn('[Warmup] Failed to trigger GeoRisk warmup in getProfile:', warmupErr.message);
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

  async register(req, res) {
    try {
      const { email, password, name } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      const existing = await userService.findByEmail(email);
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await userService.create({
        email,
        password: hashedPassword,
        name,
        emailVerified: false,
        isActive: true,
      });

      // Generate verification code (OTP)
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      await userService.createOTP({
        identifier: email,
        code: otpCode,
        type: 'VERIFICATION',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
      });

      await ActivityService.log(user.id, 'Register Success', 'User registered via local form', req.ip);

      return res.status(201).json({
        success: true,
        message: 'Registration successful. Verification code generated.',
        code: otpCode, // Exposed for easy verification demo
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      });
    } catch (err) {
      console.error('Registration error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to register user' });
    }
  }

  async verifyEmail(req, res) {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ success: false, message: 'Missing email or code' });
      }

      const verified = await userService.verifyOTP(email, code, 'VERIFICATION');
      if (!verified) {
        return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
      }

      const user = await userService.findByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      await userService.update(user.id, { emailVerified: true });
      await ActivityService.log(user.id, 'Email Verified', 'User successfully verified email address', req.ip);

      return res.json({ success: true, message: 'Email verified successfully.' });
    } catch (err) {
      console.error('Email verification error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to verify email' });
    }
  }

  async login(req, res) {
    try {
      const { email, password, rememberMe } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Missing email or password' });
      }

      const user = await userService.findByEmail(email);
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      if (user.isActive === false) {
        return res.status(403).json({
          success: false,
          message: 'This account is suspended. Please request reactivation.',
          code: 'ACCOUNT_SUSPENDED'
        });
      }

      // Check lock status
      if (user.lockUntil && user.lockUntil > new Date()) {
        const remaining = Math.round((user.lockUntil - new Date()) / 1000 / 60);
        return res.status(403).json({
          success: false,
          message: `Account locked due to consecutive failures. Try again in ${remaining} minutes.`,
          code: 'ACCOUNT_LOCKED'
        });
      }

      if (!user.password) {
        return res.status(400).json({
          success: false,
          message: `This account is linked via social authentication (${user.authProvider}). Please login using social auth.`
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        const attempts = (user.loginAttempts || 0) + 1;
        const updateData = { loginAttempts: attempts };
        if (attempts >= 5) {
          updateData.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
          await userService.update(user.id, updateData);
          return res.status(403).json({
            success: false,
            message: 'Too many failed attempts. Your account has been locked for 15 minutes.',
            code: 'ACCOUNT_LOCKED'
          });
        }
        await userService.update(user.id, updateData);
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Successful login - reset attempts
      await userService.update(user.id, { loginAttempts: 0, lockUntil: null, lastLogin: new Date() });

      const accessToken = authManager.generateToken(user, 'access');
      const refreshToken = authManager.generateToken(user, 'refresh');

      // Save session
      const rememberDuration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      await userService.createSession(user.id, {
        token: refreshToken,
        expiresAt: new Date(Date.now() + rememberDuration),
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
      });

      const crypto = require('crypto');
      const csrfToken = crypto.randomBytes(24).toString('hex');

      await ActivityService.log(user.id, 'Login Success', 'Logged in via local credentials', req.ip);

      const aOptions = accessCookieOptions();
      const rOptions = refreshCookieOptions();
      if (rememberMe) {
        rOptions.maxAge = rememberDuration;
      }

      res.cookie('access_token', accessToken, aOptions);
      res.cookie('refresh_token', refreshToken, rOptions);
      res.cookie('XSRF-TOKEN', csrfToken, csrfCookieOptions());

      // Trigger server-side background warmup for GeoRiskEngine
      try {
        const GeoRiskWarmupService = require('../services/GeoRiskWarmupService');
        GeoRiskWarmupService.triggerWarmup();
      } catch (warmupErr) {
        console.warn('[Warmup] Failed to trigger GeoRisk warmup in login:', warmupErr.message);
      }

      return res.json({
        success: true,
        message: 'Logged in successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
        }
      });
    } catch (err) {
      console.error('Login error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to authenticate user' });
    }
  }

  async getCsrfToken(req, res) {
    try {
      let csrfToken = req.cookies?.['XSRF-TOKEN'];
      if (!csrfToken) {
        const crypto = require('crypto');
        csrfToken = crypto.randomBytes(24).toString('hex');
        res.cookie('XSRF-TOKEN', csrfToken, csrfCookieOptions());
      }
      return res.status(200).json({ success: true, csrfToken });
    } catch (error) {
      console.error('Failed to get/generate CSRF token:', error.message);
      return res.status(500).json({ success: false, message: 'Failed to retrieve CSRF token' });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }

      const user = await userService.findByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, message: 'No user registered with this email address' });
      }

      // Generate Password Reset OTP
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      await userService.createOTP({
        identifier: email,
        code: resetCode,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
      });

      await ActivityService.log(user.id, 'Password Reset Requested', 'Password reset code generated', req.ip);

      return res.json({
        success: true,
        message: 'Password reset code generated.',
        code: resetCode // Exposed for easy verification demo
      });
    } catch (err) {
      console.error('Forgot password error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to process forgot password request' });
    }
  }

  async resetPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ success: false, message: 'Missing required parameters' });
      }

      const verified = await userService.verifyOTP(email, code, 'PASSWORD_RESET');
      if (!verified) {
        return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
      }

      const user = await userService.findByEmail(email);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await userService.update(user.id, { password: hashedPassword, loginAttempts: 0, lockUntil: null });
      await ActivityService.log(user.id, 'Password Reset Complete', 'User reset password successfully', req.ip);

      return res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (err) {
      console.error('Reset password error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
  }

  async getIntelligencePreview(req, res) {
    try {
      const geoRiskService = require('../services/GeoRiskService');
      let incidents = [];
      try {
        incidents = await geoRiskService.getLiveIncidents();
      } catch (err) {
        console.warn('Failed to fetch live incidents for preview:', err.message);
      }

      // If incidents is empty, provide nice static B2B fallback risk indicators
      if (!incidents || incidents.length === 0) {
        incidents = [
          {
            headline: 'Bab-el-Mandeb Strait — Transits Suspended After Tactical Drone Incidents',
            location: 'Bab-el-Mandeb Strait',
            severity: 'CRITICAL',
            category: 'piracy',
            publisher: 'RouteGuardian Maritime Intel',
            published_at: new Date().toISOString()
          },
          {
            headline: 'English Channel Corridor — High Visibility Winds & Heavy Storm Front Approaching',
            location: 'English Channel',
            severity: 'HIGH',
            category: 'weather',
            publisher: 'UK MetOffice',
            published_at: new Date().toISOString()
          },
          {
            headline: 'Singapore Port Corridor — Increased Cargo Transit Volumes Causing 12hr Queue Times',
            location: 'Singapore Port',
            severity: 'MEDIUM',
            category: 'port_closure',
            publisher: 'Singapore MPA',
            published_at: new Date().toISOString()
          }
        ];
      }

      return res.json({
        success: true,
        incidents: incidents.slice(0, 3)
      });
    } catch (err) {
      console.error('Preview error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to load intelligence preview' });
    }
  }
}

module.exports = new AuthController();