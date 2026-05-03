class LocalStrategy {
  constructor(authManager, userService) {
    this.authManager = authManager;
    this.userService = userService;
  }

  /**
   * Enhanced Authenticate logic with Brute-Force Protection & Account Status Checks
   */
  async authenticate(credentials) {
    const { email, password } = credentials;

    // 1. Basic validation
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    if (!this.authManager.validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    // 2. User existence check
    const user = await this.userService.findByEmail(email);

    if (!user) {
      throw new Error('User not found');
    }

    // --- CRITICAL: Email Verification Check (Only for LOCAL accounts) ---
    // Skip if no email service is configured (SMTP not set up)
    const emailConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
    if (emailConfigured && user.authProvider === 'LOCAL' && !user.emailVerified) {
      throw new Error('EMAIL_NOT_VERIFIED');
    }

    // --- CRITICAL: Account Status Check (Suspension/Soft Delete) ---
    if (!user.isActive) {
      throw new Error('ACCOUNT_SUSPENDED');
    }

    // --- CRITICAL SECURITY: Account Lock Check (Brute Force) ---
    if (this.authManager.isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw new Error(`Account is locked due to too many failed attempts. Try again in ${lockTimeRemaining} minutes.`);
    }

    if (!user.password) {
      throw new Error('This account uses social login. Please sign in with Google or GitHub.');
    }

    // 3. Password Verification
    const isPasswordValid = await this.authManager.comparePassword(password, user.password);

    if (!isPasswordValid) {
      // Handle failed attempt (Increments DB counter)
      const result = await this.authManager.handleFailedLogin(user, this.userService);
      
      if (result.isLocked) {
        throw new Error('Too many failed attempts. Your account has been locked for 15 minutes.');
      }

      throw new Error(`Invalid password. You have ${result.remainingAttempts} attempts remaining before your account is locked.`);
    }

    // 4. Success Logic
    // Reset login attempts to 0 and clear lockUntil
    await this.authManager.resetLoginAttempts(user.id, this.userService);

    const token = this.authManager.generateToken(user);

    // Create session persistence
    await this.userService.createSession(user.id, {
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    return {
      token,
      user: this.sanitizeUser(user)
    };
  }

  /**
   * Register a new user (WITHOUT auto-login, requires email verification)
   */
  async register(userData) {
    const { email, password, name } = userData;

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    if (!this.authManager.validateEmail(email)) {
      throw new Error('Invalid email format');
    }

    const passwordValidation = this.authManager.validatePassword(password);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.errors.join(', '));
    }

    const existingUser = await this.userService.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists with this email');
    }

    const hashedPassword = await this.authManager.hashPassword(password);

    const user = await this.userService.create({
      email,
      password: hashedPassword,
      name,
      authProvider: 'LOCAL',
      emailVerified: false,  // ⭐ NEW: Email not verified initially
      isActive: true,        // Account is active but cannot login without verification
      loginAttempts: 0,
      lockUntil: null   
    });

    // ⭐ NEW: Return user WITHOUT token (can't login until verified)
    return {
      user: this.sanitizeUser(user),
      requiresVerification: true  // ⭐ Flag for frontend
    };
  }

  /**
   * Helper to remove sensitive fields before sending to frontend
   */
  sanitizeUser(user) {
    const { password, loginAttempts, lockUntil, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}

module.exports = LocalStrategy;