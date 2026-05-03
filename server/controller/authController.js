const AuthManager = require('../src/core/auth/AuthManager');
const UserService = require('../src/core/services/UserService');
const EmailService = require('../src/core/services/EmailService');
const LocalStrategy = require('../src/core/auth/strategies/LocalStrategy');
const OAuthStrategy = require('../src/core/auth/strategies/OAuthStrategy');
const PasswordlessStrategy = require('../src/core/auth/strategies/PasswordlessStrategy');
const ActivityService = require('../src/core/services/ActivityService');
const { prisma } = require('../utils/dbConnector');

// Use Replit public domain if available, fallback to env or localhost
const REPLIT_DOMAIN = process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',')[0].trim() : null;
const BASE_URL = (process.env.BASE_URL || (REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : "http://localhost:5000")).replace(/\/+$/, "");

const authManager = new AuthManager();
const userService = new UserService();
const emailService = new EmailService();

const localStrategy = new LocalStrategy(authManager, userService);
const passwordlessStrategy = new PasswordlessStrategy(authManager, userService, emailService);

const oauthConfigs = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${BASE_URL}/api/auth/google/callback`
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL || `${BASE_URL}/api/auth/github/callback`
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    callbackUrl: process.env.FACEBOOK_CALLBACK_URL || `${BASE_URL}/api/auth/facebook/callback`
  }
};

// In-memory maps
const usedOAuthCodes = new Map();
const oauthStates = new Map();
const processingTokens = new Map(); // ⭐ NEW: Track processing tokens
const OAUTH_CODE_TTL_MS = 5 * 60 * 1000;
const OAUTH_CODE_PROCESSING_TTL_MS = 30 * 1000;
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

// Helper functions
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

function renderHtmlMessage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#f7fafc;margin:0"><div style="max-width:520px;padding:28px;background:#fff;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,0.06);text-align:center"><h2 style="margin:0 0 10px">${title}</h2><p style="margin:0;color:#333">${message}</p></div></body></html>`;
}

function getPrimaryClientUrl() {
  if (process.env.CLIENT_URL) {
    const urls = process.env.CLIENT_URL.split(',').map(url => url.trim());
    return urls[0];
  }
  if (process.env.CLIENT_USER) {
    const port = process.env.CLIENT_USER || '5173';
    return `http://localhost:${port}`;
  }
  return 'http://localhost:5173';
}

class AuthController {
  // ---------------------------------------------------------------------------
  // 1. SERVER-SIDE OAUTH REDIRECTS
  // ---------------------------------------------------------------------------

  async googleAuth(req, res) {
    const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const state = Math.random().toString(36).slice(2);

    const options = {
      redirect_uri: oauthConfigs.google.callbackUrl,
      client_id: oauthConfigs.google.clientId,
      access_type: "offline",
      response_type: "code",
      prompt: "consent",
      scope: ["openid", "email", "profile"].join(" "),
      state
    };

    storeOAuthState(state);
    return res.redirect(`${rootUrl}?${new URLSearchParams(options).toString()}`);
  }

  async githubAuth(req, res) {
    const rootUrl = `https://github.com/login/oauth/authorize`;
    const state = Math.random().toString(36).slice(2);
    storeOAuthState(state);

    const options = {
      client_id: oauthConfigs.github.clientId,
      redirect_uri: oauthConfigs.github.callbackUrl,
      scope: "user:email",
      state: state
    };

    return res.redirect(`${rootUrl}?${new URLSearchParams(options).toString()}`);
  }

  async facebookAuth(req, res) {
    const rootUrl = `https://www.facebook.com/v12.0/dialog/oauth`;
    const options = {
      client_id: oauthConfigs.facebook.clientId,
      redirect_uri: oauthConfigs.facebook.callbackUrl,
      scope: "email,public_profile",
      response_type: "code"
    };
    return res.redirect(`${rootUrl}?${new URLSearchParams(options).toString()}`);
  }

  // ---------------------------------------------------------------------------
  // 2. OAUTH CALLBACK LOGIC
  // ---------------------------------------------------------------------------

  async googleCallback(req, res) {
    try {
      const { code, state } = req.query;

      if (!code) {
        const clientUrl = getPrimaryClientUrl();
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent("Missing Google OAuth code")}`);
      }

      if (!state || !consumeOAuthState(state)) {
        console.warn('Invalid or missing OAuth state (google):', state, req.ip);
        return res.status(400).send(renderHtmlMessage('OAuth Error', 'This sign-in request appears invalid or has already been processed. Please try signing in again.'));
      }

      if (!markOAuthCodeProcessing(code)) {
        console.warn('Duplicate OAuth code reuse attempt (google):', code, req.ip);
        return res.status(200).send(renderHtmlMessage('Already Processed', 'This sign-in request has already been processed. If you did not receive access, please try again.'));
      }

      const oauthStrategy = new OAuthStrategy('google', oauthConfigs.google);

      try {
        const profile = await oauthStrategy.getProfileFromCode(code);
        const { user, isNewUser } = await userService.upsertBySocialProfile('google', profile);
        const token = authManager.generateToken(user);

        finalizeOAuthCodeUsed(code);
        await ActivityService.log(user.id, 'Login Success', 'Logged in via Google', req.ip);

        if (isNewUser) await emailService.sendWelcome(user.email, user.name);

        const clientUrl = getPrimaryClientUrl();
        return res.redirect(`${clientUrl}/auth/callback?token=${token}`);
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

      if (!code) {
        const clientUrl = getPrimaryClientUrl();
        return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent("Missing GitHub OAuth code")}`);
      }

      if (!state || !consumeOAuthState(state)) {
        console.warn('Invalid or missing OAuth state (github):', state, req.ip);
        return res.status(400).send(renderHtmlMessage('OAuth Error', 'This sign-in request appears invalid or has already been processed. Please try signing in again.'));
      }

      if (!markOAuthCodeProcessing(code)) {
        console.warn('Duplicate OAuth code reuse attempt (github):', code, req.ip);
        return res.status(200).send(renderHtmlMessage('Already Processed', 'This sign-in request has already been processed. If you did not receive access, please try again.'));
      }

      const oauthStrategy = new OAuthStrategy('github', oauthConfigs.github);

      try {
        const profile = await oauthStrategy.getProfileFromCode(code);
        const { user, isNewUser } = await userService.upsertBySocialProfile('github', profile);
        const token = authManager.generateToken(user);

        finalizeOAuthCodeUsed(code);
        await ActivityService.log(user.id, 'Login Success', 'Logged in via GitHub', req.ip);

        if (isNewUser) await emailService.sendWelcome(user.email, user.name);

        const clientUrl = getPrimaryClientUrl();
        return res.redirect(`${clientUrl}/auth/callback?token=${token}`);
      } catch (err) {
        clearOAuthCode(code);
        throw err;
      }
    } catch (error) {
      const clientUrl = getPrimaryClientUrl();
      return res.redirect(`${clientUrl}/auth?error=${encodeURIComponent(error.message)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. LOCAL AUTH METHODS
  // ---------------------------------------------------------------------------

  async register(req, res) {
    try {
      const { email, password, name } = req.body;
      
      // 1. Create user with emailVerified: false
      const result = await localStrategy.register({ 
        email, 
        password, 
        name
      });

      await ActivityService.log(result.user.id, 'Account Created', 'User registered via local strategy', req.ip);

      // 2. Generate verification token
      const verificationToken = authManager.generateMagicToken(email);
      
      // Store the actual token, not the JWT
      const rawToken = verificationToken.token;
      const decoded = authManager.verifyMagicToken(rawToken);
      
      await userService.createOTP({
        userId: result.user.id,
        identifier: email,
        code: decoded.token, // Store the actual token
        type: 'VERIFICATION',
        expiresAt: verificationToken.expiresAt
      });

      // 3. Send verification email — if SMTP not configured, auto-verify the user
      const emailConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

      if (!emailConfigured) {
        // Auto-verify: no email service, skip verification step
        await userService.update(result.user.id, { emailVerified: true });
        const token = authManager.generateToken({ ...result.user, emailVerified: true });
        await userService.createSession(result.user.id, {
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        return res.status(201).json({
          success: true,
          message: 'Registration successful! You are now logged in.',
          token,
          user: { ...result.user, emailVerified: true },
          requiresVerification: false
        });
      }

      const clientUrl = getPrimaryClientUrl();
      const verifyUrl = `${clientUrl}/verify-email?token=${rawToken}`;
      await emailService.sendVerificationEmail(email, verifyUrl, name);

      // 4. Return success but user CANNOT login yet
      res.status(201).json({ 
        success: true, 
        message: 'Registration successful! Please check your email to verify your account.',
        user: result.user,
        requiresVerification: true
      });
      
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async verifyEmail(req, res) {
    const { token } = req.body;
    
    // ⭐ NEW: Prevent duplicate processing
    if (processingTokens.has(token)) {
      console.log('Token already being processed, skipping duplicate');
      return res.status(200).json({
        success: true,
        message: 'Verification is already in progress. Please wait.'
      });
    }
    
    processingTokens.set(token, true);
    
    try {
      console.log('=== VERIFY EMAIL DEBUG START ===');
      console.log('JWT Token received:', token);
      
      if (!token) {
        throw new Error('No token provided');
      }

      // 1. Verify the JWT token
      const decoded = authManager.verifyMagicToken(token);
      console.log('Decoded JWT:', decoded);
      
      // ⭐ FIX: Check if user is already verified FIRST
      console.log('Checking if user already verified...');
      const user = await userService.findByEmail(decoded.email);
      console.log('User found:', user ? `ID: ${user.id}` : 'No user found');
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // ⭐ NEW: If already verified, just return success
      if (user.emailVerified) {
        console.log('User already verified, returning success');
        return res.status(200).json({ 
          success: true, 
          message: 'Email is already verified. You can login.',
          user: userService.sanitize(user)
        });
      }
      
      const actualToken = decoded.token;
      console.log('Actual token to search for:', actualToken);
      
      console.log('Looking for OTP...');
      const otp = await userService.verifyOTP(decoded.email, actualToken, 'VERIFICATION');
      console.log('OTP found:', !!otp);
      
      if (!otp) {
        // If OTP not found but user exists, maybe it was already used
        throw new Error('Invalid, expired, or already used verification link');
      }

      console.log('Current emailVerified status:', user.emailVerified);
      console.log('Updating user...');
      
      await userService.update(user.id, { 
        emailVerified: true,
        isActive: true
      });
      
      console.log('User updated successfully');

      // 3. Now send welcome email
      console.log('Sending welcome email...');
      await emailService.sendWelcome(user.email, user.name);

      // 4. Log activity
      await ActivityService.log(user.id, 'Email Verified', 'User verified their email address', req.ip);

      console.log('=== VERIFY EMAIL DEBUG END - SUCCESS ===');
      
      res.status(200).json({ 
        success: true, 
        message: 'Email verified successfully! You can now login.',
        user: userService.sanitize(user)
      });
      
    } catch (error) {
      console.log('=== VERIFY EMAIL DEBUG END - ERROR ===');
      console.log('Error:', error.message);
      
      res.status(400).json({ 
        success: false, 
        message: error.message
      });
    } finally {
      // Clean up after processing
      setTimeout(() => {
        processingTokens.delete(token);
      }, 5000);
    }
  }

  async resendVerification(req, res) {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email is required' 
        });
      }

      const user = await userService.findByEmail(email);
      
      if (!user) {
        // Don't reveal if user exists (security)
        return res.status(200).json({ 
          success: true, 
          message: 'If an account exists with this email, a verification link has been sent.' 
        });
      }

      // Check if already verified
      if (user.emailVerified) {
        return res.status(400).json({ 
          success: false, 
          message: 'Email is already verified.' 
        });
      }

      // Delete any existing verification tokens
      await prisma.otp.deleteMany({
        where: {
          userId: user.id,
          type: 'VERIFICATION'
        }
      });

      // Generate new verification token
      const verificationToken = authManager.generateMagicToken(email);
      
      // Store the actual token
      const decoded = authManager.verifyMagicToken(verificationToken.token);
      
      await userService.createOTP({
        userId: user.id,
        identifier: email,
        code: decoded.token,
        type: 'VERIFICATION',
        expiresAt: verificationToken.expiresAt
      });

      // Send verification email
      const clientUrl = getPrimaryClientUrl();
      const verifyUrl = `${clientUrl}/verify-email?token=${verificationToken.token}`;
      await emailService.sendVerificationEmail(email, verifyUrl, user.name);

      // Log activity
      await ActivityService.log(user.id, 'Resent Verification', 'User requested new verification email', req.ip);

      res.status(200).json({ 
        success: true, 
        message: 'Verification email sent successfully.' 
      });
      
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to resend verification email.' 
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await localStrategy.authenticate({ email, password });

      await ActivityService.log(result.user.id, 'Login Success', 'Logged in via Password', req.ip);

      res.status(200).json({ success: true, message: 'Login successful', ...result });
    } catch (error) {
      // Handle unverified users
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        try {
          // Find the user
          const user = await userService.findByEmail(email);
          if (user) {
            // Delete old verification tokens
            await prisma.otp.deleteMany({
              where: {
                userId: user.id,
                type: 'VERIFICATION'
              }
            });

            // Generate new verification token
            const verificationToken = authManager.generateMagicToken(email);
            const decoded = authManager.verifyMagicToken(verificationToken.token);
            
            await userService.createOTP({
              userId: user.id,
              identifier: email,
              code: decoded.token,
              type: 'VERIFICATION',
              expiresAt: verificationToken.expiresAt
            });

            // Send new verification email
            const clientUrl = getPrimaryClientUrl();
            const verifyUrl = `${clientUrl}/verify-email?token=${verificationToken.token}`;
            await emailService.sendVerificationEmail(email, verifyUrl, user.name);

            // Log activity
            await ActivityService.log(user.id, 'Resent Verification', 'User tried to login without verification', req.ip);
          }
          
          return res.status(403).json({
            success: false,
            message: 'Please verify your email first. A new verification link has been sent to your email.',
            code: 'EMAIL_NOT_VERIFIED',
            requiresVerification: true
          });
        } catch (resendError) {
          console.error('Failed to resend verification:', resendError);
          return res.status(403).json({
            success: false,
            message: 'Please verify your email first. Check your email for the verification link.',
            code: 'EMAIL_NOT_VERIFIED'
          });
        }
      }
      
      if (error.message === 'ACCOUNT_SUSPENDED') {
        return res.status(403).json({
          success: false,
          message: 'Your account is suspended.',
          code: 'ACCOUNT_SUSPENDED'
        });
      }
      
      res.status(401).json({ success: false, message: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. PASSWORDLESS & MAGIC LINK
  // ---------------------------------------------------------------------------

  async magicLink(req, res) {
    try {
      const { email, redirectUrl } = req.body;
      const result = await passwordlessStrategy.sendMagicLink(email, redirectUrl);
      res.status(200).json(result);
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async verifyMagicLink(req, res) {
    try {
      const { token } = req.body;
      const result = await passwordlessStrategy.verifyMagicLink(token);

      await ActivityService.log(result.user.id, 'Login Success', 'Logged in via Magic Link', req.ip);

      res.status(200).json({ success: true, message: 'Login successful', ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. ACCOUNT & PASSWORD MANAGEMENT
  // ---------------------------------------------------------------------------

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

      const user = await userService.findByEmail(email);
      if (!user) return res.status(200).json({ success: true, message: 'If an account exists, you will receive a reset link' });

      const resetToken = authManager.generateMagicToken(email);
      
      // Store actual token
      const decoded = authManager.verifyMagicToken(resetToken.token);
      
      await userService.createOTP({
        userId: user.id,
        identifier: email,
        code: decoded.token,
        type: 'PASSWORD_RESET',
        expiresAt: resetToken.expiresAt
      });

      const clientUrl = getPrimaryClientUrl();
      const resetUrl = `${clientUrl}/reset-password?token=${resetToken.token}`;
      await emailService.sendPasswordReset(email, resetUrl);
      res.status(200).json({ success: true, message: 'Password reset link sent' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to process request' });
    }
  }

  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;
      const decoded = authManager.verifyMagicToken(token);
      const otp = await userService.verifyOTP(decoded.email, decoded.token, 'PASSWORD_RESET');
      if (!otp) throw new Error('Invalid or expired reset link');

      const user = await userService.findByEmail(decoded.email);
      const passwordValidation = authManager.validatePassword(newPassword);
      if (!passwordValidation.isValid) throw new Error(passwordValidation.errors.join(', '));

      const hashedPassword = await authManager.hashPassword(newPassword);
      await userService.update(user.id, {
        password: hashedPassword,
        loginAttempts: 0,
        lockUntil: null
      });

      await userService.deleteAllUserSessions(user.id);
      await ActivityService.log(user.id, 'Password Reset', 'Password reset via email link', req.ip);

      res.status(200).json({ success: true, message: 'Password reset successful' });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await userService.findById(req.user.id);

      const isValid = await authManager.comparePassword(currentPassword, user.password);
      if (!isValid) return res.status(401).json({ success: false, message: 'Current password incorrect' });

      const passwordValidation = authManager.validatePassword(newPassword);
      if (!passwordValidation.isValid) throw new Error(passwordValidation.errors.join(', '));

      const hashedPassword = await authManager.hashPassword(newPassword);
      await userService.update(req.user.id, { password: hashedPassword });

      await ActivityService.log(req.user.id, 'Password Changed', 'User manually changed password', req.ip);

      res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. SESSION & PROFILE METHODS
  // ---------------------------------------------------------------------------

  async logout(req, res) {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) await userService.deleteSession(token);
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to logout' });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      const decoded = authManager.verifyToken(refreshToken);
      const user = await userService.findById(decoded.id);

      if (!user || !user.isActive) throw new Error('User invalid or inactive');

      const newToken = authManager.generateToken(user);
      await userService.createSession(user.id, {
        token: newToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      res.status(200).json({ success: true, token: newToken });
    } catch (error) {
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
  }

  async getProfile(req, res) {
    try {
      const user = await userService.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      res.status(200).json({
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
          age: user.age
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. ACCOUNT LIFECYCLE (SUSPENSION & REACTIVATION)
  // ---------------------------------------------------------------------------

  async requestReactivation(req, res) {
    try {
      const { email } = req.body;
      const user = await userService.findByEmail(email);

      if (!user) {
        return res.status(200).json({ success: true, message: 'If this account is suspended, a link has been sent.' });
      }

      if (user.isActive) {
        return res.status(400).json({ success: false, message: 'This account is already active.' });
      }

      const token = authManager.generateMagicToken(email);
      const decoded = authManager.verifyMagicToken(token.token);
      
      await userService.createOTP({
        userId: user.id,
        identifier: email,
        code: decoded.token,
        type: 'VERIFICATION',
        expiresAt: token.expiresAt
      });

      const clientUrl = getPrimaryClientUrl();
      const reactivateUrl = `${clientUrl}/reactivate?token=${token.token}`;
      await emailService.sendGenericEmail(
        email,
        'Reactivate Your Account',
        `Welcome back! Click the link below to reactivate your account:\n\n${reactivateUrl}`
      );

      res.status(200).json({ success: true, message: 'Reactivation link sent to your email.' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to process reactivation request.' });
    }
  }

  async confirmReactivation(req, res) {
    try {
      const { token } = req.body;
      const decoded = authManager.verifyMagicToken(token);
      const otp = await userService.verifyOTP(decoded.email, decoded.token, 'VERIFICATION');

      if (!otp) throw new Error('Invalid or expired reactivation link');

      const user = await userService.findByEmail(decoded.email);
      await userService.update(user.id, { isActive: true });

      await ActivityService.log(user.id, 'Account Reactivated', 'User reactivated account via email link', req.ip);

      res.status(200).json({ success: true, message: 'Account reactivated! You can now log in.' });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new AuthController();