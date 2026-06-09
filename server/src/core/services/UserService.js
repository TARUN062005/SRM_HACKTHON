const { prisma } = require('../../../utils/dbConnector');

class UserService {
  // --- RETRIEVAL METHODS ---

  async findByEmail(email) {
    if (!email) return null;
    return await prisma.user.findUnique({
      where: { email },
      include: { linkedAccounts: true, addresses: true }
    });
  }

  async findById(id) {
    return await prisma.user.findUnique({
      where: { id },
      include: { linkedAccounts: true, addresses: true }
    });
  }

  async findBySocialId(provider, socialId) {
    const field = `${provider}Id`;
    return await prisma.user.findFirst({
      where: { [field]: socialId }
    });
  }

  // --- MUTATION METHODS ---

  async create(userData) {
    return await prisma.user.create({
      data: {
        ...userData,
        loginAttempts: 0,
        isActive: userData.isActive !== undefined ? userData.isActive : true
      },
      include: { linkedAccounts: true, addresses: true }
    });
  }

  async update(id, updateData) {
    return await prisma.user.update({
      where: { id },
      data: updateData
    });
  }

  /**
   * PERMANENT DELETE (Hard Delete)
   * Wipes the user and all cascading relations (Sessions, Logs, OTPs)
   */
  async delete(id) {
    return await prisma.user.delete({
      where: { id }
    });
  }

  /**
   * Social Login logic with automatic Profile Sync
   * - Creates user if new
   * - Links provider ID if user exists
   * - Updates missing fields (name, profileImage, authProvider, verification)
   * - Makes account verified when provider confirms verified email
   */
  async upsertBySocialProfile(provider, profile) {
    const providerKey = provider.toLowerCase(); // google | github | facebook
    const providerField = `${providerKey}Id`;

    const providerId = profile?.id;
    if (!providerId) throw new Error('OAuth profile missing provider id');

    const incomingEmail = profile?.email || null;
    const incomingName = profile?.name || null;

    // picture comes from our OAuthStrategy (google/github/facebook)
    const incomingPicture =
      profile?.picture || profile?.avatar_url || null;

    // OAuth verification flag (google gives email_verified, github we derive it)
    const providerEmailVerified = profile?.email_verified === true;

    let isNewUser = false;

    // 1) Try match user by providerId first
    let user = await this.findBySocialId(providerKey, providerId);

    // 2) If not found, fallback match by email
    if (!user && incomingEmail) {
      user = await this.findByEmail(incomingEmail);
    }

    // -----------------------
    // CASE A: New user
    // -----------------------
    if (!user) {
      isNewUser = true;

      user = await this.create({
        [providerField]: providerId,

        email: incomingEmail,
        name: incomingName,
        profileImage: incomingPicture,

        authProvider: providerKey.toUpperCase(),

        // ✅ Make verified when provider says verified
        emailVerified: providerEmailVerified,

        // OAuth accounts are active by default
        isActive: true,

        // ✅ For OAuth users: password remains null
        password: null
      });

      return { user, isNewUser };
    }

    // -----------------------
    // CASE B: Existing user
    // -----------------------

    const updateData = {
      // Always link provider ID (so next time login matches by social id)
      [providerField]: user[providerField] || providerId,

      // Auto-reactivate if they login via social
      isActive: true,

      // Reset lock status
      loginAttempts: 0,
      lockUntil: null
    };

    /**
     * Sync important profile fields WITHOUT overwriting manually set values.
     * This is how real websites do it.
     */
    if (!user.name && incomingName) updateData.name = incomingName;

    // Only set profile image if user doesn't have one
    if (!user.profileImage && incomingPicture) updateData.profileImage = incomingPicture;

    // Provider field (many apps update it to latest)
    if (!user.authProvider) updateData.authProvider = providerKey.toUpperCase();

    // ✅ If provider confirms verified email, store verified true permanently
    if (providerEmailVerified && user.emailVerified !== true) {
      updateData.emailVerified = true;
    }

    // If user doesn't have email stored yet, save incoming
    if (!user.email && incomingEmail) updateData.email = incomingEmail;

    // Apply update only if needed
    user = await this.update(user.id, updateData);

    return { user, isNewUser };
  }

  // --- SESSION MANAGEMENT ---

  async createSession(userId, sessionData) {
    return await prisma.session.create({
      data: { userId, ...sessionData }
    });
  }

  async deleteSession(token) {
    return await prisma.session.delete({
      where: { token }
    });
  }

  async deleteAllUserSessions(userId) {
    return await prisma.session.deleteMany({
      where: { userId }
    });
  }

  async cleanExpiredSessions() {
    return await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
  }

  // --- OTP & VERIFICATION ---

  async createOTP(otpData) {
    await prisma.otp.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    return await prisma.otp.create({ data: otpData });
  }

  async verifyOTP(identifier, code, type) {
    const otp = await prisma.otp.findFirst({
      where: {
        identifier,
        code,
        type,
        expiresAt: { gt: new Date() }
      }
    });

    if (!otp) return null;

    await prisma.otp.delete({ where: { id: otp.id } });
    return otp;
  }

  // --- UTILS & ANALYTICS ---

  async getUserStats() {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const todayUsers = await prisma.user.count({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }
    });

    return {
      totalUsers,
      activeUsers,
      todayUsers,
      inactiveUsers: totalUsers - activeUsers
    };
  }

  /**
   * Helper to ensure sensitive security data doesn't leak
   */
  sanitize(user) {
    if (!user) return null;
    const { password, loginAttempts, lockUntil, ...sanitized } = user;
    return sanitized;
  }
}

module.exports = UserService;
