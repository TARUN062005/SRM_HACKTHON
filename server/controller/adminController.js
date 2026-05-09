const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const ejs = require('ejs');
const { prisma } = require('../utils/dbConnector');
const UserService = require('../src/core/services/UserService');
const ActivityService = require('../src/core/services/ActivityService');
const EmailService = require('../src/core/services/EmailService');

// ✅ NEW: FCM push sender
const { sendPushToTokens } = require('../utils/push/fcm');

const userService = new UserService();
const emailService = new EmailService();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_JWT_EXPIRES = process.env.ADMIN_JWT_EXPIRES || '1d';

class AdminController {
  constructor() {
    // bind all
    this.login = this.login.bind(this);
    this.getMe = this.getMe.bind(this);

    this.logAdminAction = this.logAdminAction.bind(this);

    // Admin profile methods
    this.getAdminProfile = this.getAdminProfile.bind(this);
    this.updateAdminProfile = this.updateAdminProfile.bind(this);
    this.uploadAvatar = this.uploadAvatar.bind(this);
    this.removeAvatar = this.removeAvatar.bind(this);
    this.changeAdminPassword = this.changeAdminPassword.bind(this);
    this.getAdminSessions = this.getAdminSessions.bind(this);
    this.revokeAdminSession = this.revokeAdminSession.bind(this);
    this.updateAdminPreferences = this.updateAdminPreferences.bind(this);
    this.getAdminActivity = this.getAdminActivity.bind(this);
    this.getAdminProfileStats = this.getAdminProfileStats.bind(this);
    this.getAdminPermissions = this.getAdminPermissions.bind(this);
    this.updateAdminPermissions = this.updateAdminPermissions.bind(this);

    // User management methods
    this.getAllUsers = this.getAllUsers.bind(this);
    this.getUserById = this.getUserById.bind(this);
    this.getUserActivity = this.getUserActivity.bind(this);
    this.suspendUser = this.suspendUser.bind(this);
    this.reactivateUser = this.reactivateUser.bind(this);
    this.changeUserRole = this.changeUserRole.bind(this);
    this.deleteUser = this.deleteUser.bind(this);

    // Notification methods
    this.sendBroadcastNotification = this.sendBroadcastNotification.bind(this);
    this.sendNotificationToUser = this.sendNotificationToUser.bind(this);
    this.getAllNotifications = this.getAllNotifications.bind(this);
    this.getNotificationById = this.getNotificationById.bind(this);
    this.updateNotification = this.updateNotification.bind(this);
    this.deleteNotification = this.deleteNotification.bind(this);

    // Email methods
    this.sendBroadcastEmail = this.sendBroadcastEmail.bind(this);

    // ✅ NEW unified broadcast
    this.sendBroadcast = this.sendBroadcast.bind(this);
    this.getScheduledBroadcasts = this.getScheduledBroadcasts.bind(this);
    this.cancelScheduledBroadcast = this.cancelScheduledBroadcast.bind(this);

    // Email templates
    this.getEmailTemplates = this.getEmailTemplates.bind(this);
    this.createEmailTemplate = this.createEmailTemplate.bind(this);
    this.updateEmailTemplate = this.updateEmailTemplate.bind(this);
    this.deleteEmailTemplate = this.deleteEmailTemplate.bind(this);

    // Analytics
    this.getBroadcastAnalytics = this.getBroadcastAnalytics.bind(this);
    this.getAllBroadcastAnalytics = this.getAllBroadcastAnalytics.bind(this);

    // Stats & Audit methods
    this.getAdminStats = this.getAdminStats.bind(this);
    this.getAuditLogs = this.getAuditLogs.bind(this);
  }

  // -----------------------------------------------------------
  // ADMIN AUTH
  // -----------------------------------------------------------

  async login(req, res) {
    try {
      if (!JWT_SECRET) {
        return res.status(500).json({
          success: false,
          message: 'Server misconfiguration: JWT_SECRET missing',
        });
      }
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'email and password required',
        });
      }

      const adminUser = await prisma.user.findFirst({
        where: {
          email,
          role: 'ADMIN',
        },
      });

      if (!adminUser) {
        return res.status(401).json({
          success: false,
          message: 'Invalid admin credentials',
        });
      }

      if (!adminUser.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Admin account is suspended',
        });
      }

      const passwordMatch = await bcrypt.compare(password, adminUser.password);
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid admin credentials',
        });
      }

      const token = jwt.sign(
        {
          id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role,
          authProvider: adminUser.authProvider,
          isActive: adminUser.isActive,
        },
        JWT_SECRET,
        { expiresIn: ADMIN_JWT_EXPIRES }
      );

      await ActivityService.log(
        adminUser.id,
        'ADMIN_LOGIN',
        'Admin logged in via admin panel',
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: 'Admin login successful',
        token,
        admin: {
          id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role,
          name: adminUser.name,
        },
      });
    } catch (err) {
      console.error('Admin login error:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to login admin',
      });
    }
  }

  async getMe(req, res) {
    try {
      const adminId = req.user.id;

      const adminUser = await prisma.user.findUnique({
        where: { id: adminId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          profileImage: true,
          authProvider: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          createdAt: true,
        },
      });

      if (!adminUser) {
        return res.status(404).json({
          success: false,
          message: 'Admin user not found',
        });
      }

      res.status(200).json({
        success: true,
        admin: adminUser,
      });
    } catch (err) {
      console.error('Admin getMe error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin data',
      });
    }
  }

  // -----------------------------------------------------------
  // INTERNAL: ADMIN AUDIT LOGGER
  // -----------------------------------------------------------
  async logAdminAction(adminId, actionType, targetUserId, details, ip, metadata = {}) {
    try {
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          actionType,
          targetUserId: targetUserId || null,
          details: details || null,
          ip: ip || null,
          metadata,
        },
      });
    } catch (err) {
      console.error('AdminAuditLog error:', err.message);
    }
  }

  // -----------------------------------------------------------
  // ADMIN PROFILE MANAGEMENT
  // -----------------------------------------------------------

  async getAdminProfile(req, res) {
    try {
      const adminId = req.user.id;

      const admin = await prisma.user.findUnique({
        where: { id: adminId, role: 'ADMIN' },
        include: {
          adminProfile: true,
          adminPermissions: {
            select: { permission: true, grantedAt: true },
          },
        },
      });

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found',
        });
      }

      const totalActions = await prisma.adminAuditLog.count({
        where: { adminId },
      });

      const response = {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        profileImage: admin.profileImage,
        phone: admin.phone,
        gender: admin.gender,
        dob: admin.dob,
        bio: admin.bio,
        location: admin.location,
        country: admin.country,
        authProvider: admin.authProvider,
        emailVerified: admin.emailVerified,
        phoneVerified: admin.phoneVerified,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
        adminProfile: admin.adminProfile || {
          title: 'Administrator',
          department: 'Management',
          timezone: 'UTC',
          language: 'en',
          theme: 'light',
        },
        permissions: admin.adminPermissions.map((p) => p.permission),
        stats: {
          totalActions,
          lastSeen: admin.adminProfile?.lastSeen || null,
        },
      };

      res.status(200).json({
        success: true,
        profile: response,
      });
    } catch (err) {
      console.error('Admin getAdminProfile error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin profile',
      });
    }
  }

  async updateAdminProfile(req, res) {
    try {
      const adminId = req.user.id;
      const {
        name,
        phone,
        gender,
        dob,
        bio,
        location,
        country,
        title,
        department,
        employeeId,
        signature,
        officeLocation,
        backupEmail,
        emergencyContact,
        workPhone,
        timezone,
      } = req.body;

      const userUpdateData = {};
      if (name !== undefined) userUpdateData.name = name;
      if (phone !== undefined) userUpdateData.phone = phone;
      if (gender !== undefined) userUpdateData.gender = gender;
      if (dob !== undefined) userUpdateData.dob = dob;
      if (bio !== undefined) userUpdateData.bio = bio;
      if (location !== undefined) userUpdateData.location = location;
      if (country !== undefined) userUpdateData.country = country;

      if (Object.keys(userUpdateData).length > 0) {
        await prisma.user.update({
          where: { id: adminId },
          data: userUpdateData,
        });
      }

      const adminProfileData = {};
      if (title !== undefined) adminProfileData.title = title;
      if (department !== undefined) adminProfileData.department = department;
      if (employeeId !== undefined) adminProfileData.employeeId = employeeId;
      if (signature !== undefined) adminProfileData.signature = signature;
      if (officeLocation !== undefined) adminProfileData.officeLocation = officeLocation;
      if (backupEmail !== undefined) adminProfileData.backupEmail = backupEmail;
      if (emergencyContact !== undefined) adminProfileData.emergencyContact = emergencyContact;
      if (workPhone !== undefined) adminProfileData.workPhone = workPhone;
      if (timezone !== undefined) adminProfileData.timezone = timezone;

      if (Object.keys(adminProfileData).length > 0) {
        const existingProfile = await prisma.adminProfile.findUnique({
          where: { adminId },
        });

        if (existingProfile) {
          await prisma.adminProfile.update({
            where: { adminId },
            data: adminProfileData,
          });
        } else {
          await prisma.adminProfile.create({
            data: {
              adminId,
              ...adminProfileData,
            },
          });
        }
      }

      await ActivityService.log(
        adminId,
        'ADMIN_PROFILE_UPDATED',
        'Admin updated their profile',
        req.ip
      );

      await this.logAdminAction(
        adminId,
        'USER_PROFILE_UPDATED',
        adminId,
        'Admin updated their own profile',
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Admin profile updated successfully',
      });
    } catch (err) {
      console.error('Admin updateAdminProfile error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to update admin profile',
      });
    }
  }

  async uploadAvatar(req, res) {
    try {
      const adminId = req.user.id;
      const { avatarUrl } = req.body;

      if (!avatarUrl) {
        return res.status(400).json({
          success: false,
          message: 'avatarUrl is required',
        });
      }

      await prisma.user.update({
        where: { id: adminId },
        data: { profileImage: avatarUrl },
      });

      await ActivityService.log(
        adminId,
        'ADMIN_AVATAR_UPDATED',
        'Admin updated their avatar',
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Avatar updated successfully',
        avatarUrl,
      });
    } catch (err) {
      console.error('Admin uploadAvatar error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to upload avatar',
      });
    }
  }

  async removeAvatar(req, res) {
    try {
      const adminId = req.user.id;

      await prisma.user.update({
        where: { id: adminId },
        data: { profileImage: null },
      });

      await ActivityService.log(
        adminId,
        'ADMIN_AVATAR_REMOVED',
        'Admin removed their avatar',
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Avatar removed successfully',
      });
    } catch (err) {
      console.error('Admin removeAvatar error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to remove avatar',
      });
    }
  }

  async changeAdminPassword(req, res) {
    try {
      const adminId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required',
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters',
        });
      }

      const admin = await prisma.user.findUnique({
        where: { id: adminId },
        select: { password: true },
      });

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found',
        });
      }

      const passwordMatch = await bcrypt.compare(currentPassword, admin.password);
      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: adminId },
        data: { password: hashedPassword },
      });

      await userService.deleteAllUserSessions(adminId);

      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        await prisma.session.create({
          data: {
            userId: adminId,
            token,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      await ActivityService.log(
        adminId,
        'ADMIN_PASSWORD_CHANGED',
        'Admin changed their password',
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (err) {
      console.error('Admin changeAdminPassword error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to change password',
      });
    }
  }

  async getAdminSessions(req, res) {
    try {
      const adminId = req.user.id;

      const sessions = await prisma.session.findMany({
        where: { userId: adminId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const currentToken = req.headers.authorization?.split(' ')[1];
      const sessionsWithCurrent = sessions.map((session) => ({
        ...session,
        isCurrent: session.token === currentToken,
      }));

      res.status(200).json({
        success: true,
        sessions: sessionsWithCurrent,
      });
    } catch (err) {
      console.error('Admin getAdminSessions error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sessions',
      });
    }
  }

  async revokeAdminSession(req, res) {
    try {
      const adminId = req.user.id;
      const { sessionId } = req.params;
      const currentToken = req.headers.authorization?.split(' ')[1];

      const session = await prisma.session.findFirst({
        where: {
          id: sessionId,
          userId: adminId,
        },
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found',
        });
      }

      if (session.token === currentToken) {
        return res.status(400).json({
          success: false,
          message: 'Cannot revoke current session',
        });
      }

      await prisma.session.delete({
        where: { id: sessionId },
      });

      await ActivityService.log(
        adminId,
        'ADMIN_SESSION_REVOKED',
        `Admin revoked session from ${session.ipAddress || 'unknown IP'}`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Session revoked successfully',
      });
    } catch (err) {
      console.error('Admin revokeAdminSession error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to revoke session',
      });
    }
  }

  async updateAdminPreferences(req, res) {
    try {
      const adminId = req.user.id;
      const { theme, language, notifications } = req.body;

      const updateData = {};
      if (theme !== undefined) updateData.theme = theme;
      if (language !== undefined) updateData.language = language;
      if (notifications !== undefined) updateData.notifications = notifications;

      const existingProfile = await prisma.adminProfile.findUnique({
        where: { adminId },
      });

      if (existingProfile) {
        await prisma.adminProfile.update({
          where: { adminId },
          data: updateData,
        });
      } else {
        await prisma.adminProfile.create({
          data: {
            adminId,
            ...updateData,
          },
        });
      }

      await ActivityService.log(
        adminId,
        'ADMIN_PREFERENCES_UPDATED',
        'Admin updated their preferences',
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Preferences updated successfully',
      });
    } catch (err) {
      console.error('Admin updateAdminPreferences error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to update preferences',
      });
    }
  }

  async getAdminActivity(req, res) {
    try {
      const adminId = req.user.id;

      const activityLogs = await prisma.activityLog.findMany({
        where: { userId: adminId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const auditLogs = await prisma.adminAuditLog.findMany({
        where: { adminId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      res.status(200).json({
        success: true,
        activityLogs,
        auditLogs,
      });
    } catch (err) {
      console.error('Admin getAdminActivity error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin activity',
      });
    }
  }

  async getAdminProfileStats(req, res) {
    try {
      const adminId = req.user.id;

      const [
        totalActions,
        totalUsersManaged,
        totalBroadcastsSent,
        totalNotificationsSent,
        recentActions,
      ] = await Promise.all([
        prisma.adminAuditLog.count({ where: { adminId } }),
        prisma.adminAuditLog.count({
          where: {
            adminId,
            actionType: {
              in: [
                'USER_SUSPENDED',
                'USER_REACTIVATED',
                'USER_DELETED',
                'USER_ROLE_CHANGED',
              ],
            },
          },
        }),
        prisma.adminAuditLog.count({
          where: {
            adminId,
            actionType: 'BROADCAST_NOTIFICATION_SENT',
          },
        }),
        prisma.adminAuditLog.count({
          where: {
            adminId,
            actionType: 'NOTIFICATION_SENT',
          },
        }),
        prisma.adminAuditLog.findMany({
          where: { adminId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            admin: {
              select: { name: true, email: true },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        stats: {
          totalActions,
          totalUsersManaged,
          totalBroadcastsSent,
          totalNotificationsSent,
        },
        recentActions,
      });
    } catch (err) {
      console.error('Admin getAdminProfileStats error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin stats',
      });
    }
  }

  async getAdminPermissions(req, res) {
    try {
      const adminId = req.user.id;

      const permissions = await prisma.adminPermissionMapping.findMany({
        where: { adminId },
        select: { permission: true, grantedAt: true },
      });

      const allPermissions = Object.values(AdminController.AdminPermission || {});

      res.status(200).json({
        success: true,
        permissions: permissions.map((p) => p.permission),
        allPermissions,
        isSuperAdmin: req.user.role === 'ADMIN',
      });
    } catch (err) {
      console.error('Admin getAdminPermissions error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permissions',
      });
    }
  }

  async updateAdminPermissions(req, res) {
    try {
      const superAdminId = req.user.id;
      const { adminId } = req.params;
      const { permissions } = req.body;

      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Only super admin can update permissions',
        });
      }

      const validPermissions = Object.values(AdminController.AdminPermission || {});
      const invalidPermissions = (permissions || []).filter(
        (p) => !validPermissions.includes(p)
      );

      if (invalidPermissions.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid permissions: ${invalidPermissions.join(', ')}`,
        });
      }

      await prisma.adminPermissionMapping.deleteMany({
        where: { adminId },
      });

      if ((permissions || []).length > 0) {
        const permissionData = permissions.map((permission) => ({
          adminId,
          permission,
          grantedBy: superAdminId,
        }));

        await prisma.adminPermissionMapping.createMany({
          data: permissionData,
        });
      }

      await this.logAdminAction(
        superAdminId,
        'PERMISSIONS_UPDATED',
        adminId,
        `Updated permissions: ${(permissions || []).join(', ')}`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Permissions updated successfully',
      });
    } catch (err) {
      console.error('Admin updateAdminPermissions error:', err.message);
      res.status(500).json({
        success: false,
        message: 'Failed to update permissions',
      });
    }
  }

  // -----------------------------------------------------------
  // USERS MANAGEMENT
  // -----------------------------------------------------------

  async getAllUsers(req, res) {
    try {
      const { search, role, status } = req.query;
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '10', 10);

      const skip = (page - 1) * limit;
      const where = {};

      if (role) where.role = role;
      if (status === 'active') where.isActive = true;
      if (status === 'suspended') where.isActive = false;

      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            role: true,
            email: true,
            phone: true,
            name: true,
            profileImage: true,
            authProvider: true,
            emailVerified: true,
            phoneVerified: true,
            isActive: true,
            emailSubscribed: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        users,
      });
    } catch (err) {
      console.error('Admin getAllUsers error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
  }

  async getUserById(req, res) {
    try {
      const userId = req.params.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          linkedAccounts: true,
          addresses: true,
          pushTokens: true,
        },
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.status(200).json({
        success: true,
        user: userService.sanitize(user),
      });
    } catch (err) {
      console.error('Admin getUserById error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
  }

  async getUserActivity(req, res) {
    try {
      const userId = req.params.id;

      const logs = await prisma.activityLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      res.status(200).json({ success: true, logs });
    } catch (err) {
      console.error('Admin getUserActivity error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch user activity' });
    }
  }

  async suspendUser(req, res) {
    try {
      const adminId = req.user.id;
      const userId = req.params.id;

      if (adminId === userId) {
        return res.status(400).json({
          success: false,
          message: 'Admin cannot suspend their own account',
        });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      await userService.deleteAllUserSessions(userId);
      await ActivityService.log(userId, 'Account Suspended', 'Suspended by admin', req.ip);

      await this.logAdminAction(
        adminId,
        'USER_SUSPENDED',
        userId,
        `Admin suspended user account (${user.email || user.id})`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'User suspended successfully',
        user: userService.sanitize(updated),
      });
    } catch (err) {
      console.error('Admin suspendUser error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to suspend user' });
    }
  }

  async reactivateUser(req, res) {
    try {
      const adminId = req.user.id;
      const userId = req.params.id;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive: true },
      });

      await ActivityService.log(userId, 'Account Reactivated', 'Reactivated by admin', req.ip);

      await this.logAdminAction(
        adminId,
        'USER_REACTIVATED',
        userId,
        `Admin reactivated user account (${user.email || user.id})`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'User reactivated successfully',
        user: userService.sanitize(updated),
      });
    } catch (err) {
      console.error('Admin reactivateUser error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to reactivate user' });
    }
  }

  async changeUserRole(req, res) {
    try {
      const adminId = req.user.id;
      const userId = req.params.id;
      const { role } = req.body;

      if (!role || !['ADMIN', 'USER'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role value' });
      }

      if (adminId === userId) {
        return res.status(400).json({
          success: false,
          message: 'Admin cannot change their own role',
        });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { role },
      });

      await this.logAdminAction(
        adminId,
        'USER_ROLE_CHANGED',
        userId,
        `Admin changed user role (${user.email || user.id}) -> ${role}`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: `User role updated to ${role}`,
        user: userService.sanitize(updated),
      });
    } catch (err) {
      console.error('Admin changeUserRole error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to update role' });
    }
  }

  async deleteUser(req, res) {
    try {
      const adminId = req.user.id;
      const userId = req.params.id;

      if (adminId === userId) {
        return res.status(400).json({
          success: false,
          message: 'Admin cannot delete their own account',
        });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      await userService.deleteAllUserSessions(userId);

      await prisma.user.delete({
        where: { id: userId },
      });

      await this.logAdminAction(
        adminId,
        'USER_DELETED',
        userId,
        `Admin deleted user (${user.email || user.id}) permanently`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'User deleted permanently',
      });
    } catch (err) {
      console.error('Admin deleteUser error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
  }

  // -----------------------------------------------------------
  // NOTIFICATIONS
  // -----------------------------------------------------------

  async sendBroadcastNotification(req, res) {
    try {
      const adminId = req.user.id;
      const { title, message, type } = req.body;

      if (!title || !message) {
        return res.status(400).json({ success: false, message: 'title and message required' });
      }

      const notif = await prisma.notification.create({
        data: {
          title,
          message,
          type: type || 'SYSTEM',
          target: 'ALL_USERS',
          createdById: adminId,
        },
      });

      const users = await prisma.user.findMany({
        select: { id: true },
      });

      if (users.length > 0) {
        await prisma.userNotification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            notificationId: notif.id,
            isRead: false,
          })),
        });
      }

      await this.logAdminAction(
        adminId,
        'BROADCAST_NOTIFICATION_SENT',
        null,
        `Broadcast notification sent: ${title}`,
        req.ip
      );

      res.status(201).json({
        success: true,
        message: 'Broadcast notification sent',
        notification: notif,
      });
    } catch (err) {
      console.error('Admin sendBroadcastNotification error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to broadcast notification' });
    }
  }

  async sendNotificationToUser(req, res) {
    try {
      const adminId = req.user.id;
      const userId = req.params.id;
      const { title, message, type } = req.body;

      if (!title || !message) {
        return res.status(400).json({ success: false, message: 'title and message required' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      const notif = await prisma.notification.create({
        data: {
          title,
          message,
          type: type || 'SYSTEM',
          target: 'SINGLE_USER',
          userId,
          createdById: adminId,
        },
      });

      await prisma.userNotification.create({
        data: {
          userId,
          notificationId: notif.id,
          isRead: false,
        },
      });

      await this.logAdminAction(
        adminId,
        'NOTIFICATION_SENT',
        userId,
        `Notification sent to user (${user.email || user.id}): ${title}`,
        req.ip
      );

      res.status(201).json({
        success: true,
        message: 'Notification sent',
        notification: notif,
      });
    } catch (err) {
      console.error('Admin sendNotificationToUser error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to send notification' });
    }
  }

  async getAllNotifications(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        sendMode,
        search
      } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const where = {};

      if (type) where.type = type;
      if (status) where.status = status;
      if (sendMode) where.sendMode = sendMode;

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [total, notifications] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit),
          include: {
            createdBy: {
              select: { id: true, name: true, email: true },
            },
            _count: {
              select: {
                userNotifications: true,
              },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        }
      });
    } catch (err) {
      console.error('Admin getAllNotifications error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
  }

  async getNotificationById(req, res) {
    try {
      const notificationId = req.params.id;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          userNotifications: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
            take: 50,
          },
          _count: {
            select: {
              userNotifications: true,
              userNotifications: {
                where: { isRead: true },
              },
            },
          },
        },
      });

      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }

      // Get delivery stats
      const deliveryStats = await prisma.deliveryTracking.groupBy({
        by: ['channel', 'status'],
        where: { notificationId },
        _count: true,
      });

      res.status(200).json({
        success: true,
        notification,
        stats: {
          totalRecipients: notification._count.userNotifications,
          readCount: notification._count.userNotifications?.where?.isRead || 0,
          deliveryStats,
        },
      });
    } catch (err) {
      console.error('Admin getNotificationById error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch notification' });
    }
  }

  async updateNotification(req, res) {
    try {
      const adminId = req.user.id;
      const notificationId = req.params.id;
      const { status, sendMode } = req.body;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }

      const updateData = {};
      if (status) updateData.status = status;
      if (sendMode) updateData.sendMode = sendMode;

      if (sendMode === 'CANCELLED' && notification.sendMode === 'LATER') {
        updateData.status = 'CANCELLED';
        await this.logAdminAction(
          adminId,
          'BROADCAST_CANCELLED',
          null,
          `Cancelled scheduled broadcast: ${notification.title}`,
          req.ip,
          { notificationId }
        );
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: updateData,
      });

      res.status(200).json({
        success: true,
        message: 'Notification updated successfully',
        notification: updated,
      });
    } catch (err) {
      console.error('Admin updateNotification error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to update notification' });
    }
  }

  async deleteNotification(req, res) {
    try {
      const adminId = req.user.id;
      const notificationId = req.params.id;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }

      // Only allow deletion of DRAFT or CANCELLED notifications
      if (!['DRAFT', 'CANCELLED'].includes(notification.status)) {
        return res.status(400).json({
          success: false,
          message: 'Only DRAFT or CANCELLED notifications can be deleted',
        });
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      await this.logAdminAction(
        adminId,
        'NOTIFICATION_DELETED',
        null,
        `Deleted notification: ${notification.title}`,
        req.ip,
        { notificationId }
      );

      res.status(200).json({
        success: true,
        message: 'Notification deleted successfully',
      });
    } catch (err) {
      console.error('Admin deleteNotification error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to delete notification' });
    }
  }

  // -----------------------------------------------------------
  // EMAIL BROADCAST
  // -----------------------------------------------------------

  async sendBroadcastEmail(req, res) {
    try {
      const adminId = req.user.id;
      const { subject, message } = req.body;

      if (!subject || !message) {
        return res.status(400).json({
          success: false,
          message: 'subject and message required',
        });
      }

      // ✅ respect unsubscribe
      const users = await prisma.user.findMany({
        where: {
          email: { not: null },
          emailSubscribed: true,
        },
        select: { email: true },
      });

      const emails = users.map((u) => u.email).filter(Boolean);

      const chunkSize = 50;

      for (let i = 0; i < emails.length; i += chunkSize) {
        const chunk = emails.slice(i, i + chunkSize);

        for (const email of chunk) {
          try {
            await emailService.sendGenericEmail(email, subject, message);
          } catch (e) {
            console.error('Email send failed:', email, e.message);
          }
        }
      }

      await this.logAdminAction(
        adminId,
        'BROADCAST_EMAIL_SENT',
        null,
        `Broadcast email sent to ${emails.length} users: ${subject}`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Broadcast email sending finished',
        totalRecipients: emails.length,
      });
    } catch (err) {
      console.error('Admin sendBroadcastEmail error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to send broadcast email' });
    }
  }
  // -----------------------------------------------------------
  // ✅ UPDATED: UNIFIED BROADCAST (PRODUCTION-GRADE)
  // -----------------------------------------------------------
  async sendBroadcast(req, res) {
    try {
      const adminId = req.user.id;

      let {
        target,
        userIds = [],
        channels = { inApp: true, email: false, push: false },
        sendMode = "NOW",
        scheduledAt,
        expiryDays = 7,
        cta = { label: null, url: null },
        mode = "notification", // notification | email
        title,
        message,
        type = "SYSTEM",
        priority = "NORMAL",
        bannerUrl = null,
        subject,
        htmlTemplate,
      } = req.body;

      console.log("Broadcast request received:", {
        mode,
        target,
        channels,
        title: title?.substring(0, 50),
        subject: subject?.substring(0, 50),
        sendMode,
        scheduledAt,
      });

      // ------------------ validation ------------------
      if (mode === "notification") {
        if (!title || !title.trim()) {
          return res.status(400).json({ success: false, message: "Notification title is required" });
        }
        if (!message || !message.trim()) {
          return res.status(400).json({ success: false, message: "Notification message is required" });
        }
      } else if (mode === "email") {
        if (!subject || !subject.trim()) {
          return res.status(400).json({ success: false, message: "Email subject is required" });
        }
        if ((!message || !message.trim()) && (!htmlTemplate || !htmlTemplate.trim())) {
          return res.status(400).json({
            success: false,
            message: "Email content (message or htmlTemplate) is required",
          });
        }
        if (!title || !title.trim()) title = subject;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid mode. Use 'notification' or 'email'",
        });
      }

      const sendInApp = !!channels.inApp;
      const sendEmail = !!channels.email;
      const sendPush = !!channels.push;

      if (!sendInApp && !sendEmail && !sendPush) {
        return res.status(400).json({
          success: false,
          message: "Select at least one channel (in-app/email/push)",
        });
      }

      if (!["NOW", "LATER"].includes(sendMode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid sendMode. Use NOW | LATER",
        });
      }

      let scheduledDate = null;
      if (sendMode === "LATER") {
        if (!scheduledAt) {
          return res.status(400).json({
            success: false,
            message: "scheduledAt is required for sendMode=LATER",
          });
        }
        scheduledDate = new Date(scheduledAt);
        if (Number.isNaN(scheduledDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid scheduledAt datetime",
          });
        }
        if (scheduledDate.getTime() < Date.now() + 60 * 1000) {
          return res.status(400).json({
            success: false,
            message: "scheduledAt must be at least 1 minute in the future",
          });
        }
      }

      if (typeof expiryDays !== "number" || expiryDays < 0 || expiryDays > 365) {
        return res.status(400).json({
          success: false,
          message: "expiryDays must be between 0 and 365",
        });
      }

      // CTA URL validation
      if (cta?.url && cta.url.trim()) {
        try {
          const urlToCheck = cta.url.startsWith("/") ? `http://localhost${cta.url}` : cta.url;
          const parsed = new URL(urlToCheck);

          if (!cta.url.startsWith("/") && !["http:", "https:"].includes(parsed.protocol)) {
            return res.status(400).json({
              success: false,
              message: "CTA URL must be http or https",
            });
          }
        } catch {
          return res.status(400).json({
            success: false,
            message: "Invalid CTA URL format (https://... or /path)",
          });
        }
      }

      // ------------------ recipients ------------------
      let users = [];
      let notificationTarget = "ALL_USERS";
      let notificationUserId = null;

      if (target === "ALL") {
        users = await prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, email: true, emailSubscribed: true, name: true },
        });
      } else if (target === "SINGLE") {
        if (!userIds || userIds.length !== 1) {
          return res.status(400).json({
            success: false,
            message: "For SINGLE target, userIds must contain exactly 1 userId",
          });
        }
        users = await prisma.user.findMany({
          where: { id: userIds[0], isActive: true },
          select: { id: true, email: true, emailSubscribed: true, name: true },
        });
        notificationTarget = "SINGLE_USER";
        notificationUserId = users[0]?.id || null;
      } else if (target === "SELECTED") {
        if (!userIds || userIds.length === 0) {
          return res.status(400).json({
            success: false,
            message: "For SELECTED target, userIds is required",
          });
        }
        users = await prisma.user.findMany({
          where: { id: { in: userIds }, isActive: true },
          select: { id: true, email: true, emailSubscribed: true, name: true },
        });
        notificationTarget = "SELECTED_USERS";
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid target. Use ALL | SELECTED | SINGLE",
        });
      }

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No users found for this broadcast",
        });
      }

      console.log(`Found ${users.length} users for broadcast`);

      // ------------------ expiry ------------------
      const expiresAt =
        expiryDays === 0 ? null : new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

      // ------------------ store notification + tracking ------------------
      const createdNotification = await prisma.$transaction(async (tx) => {
        const notification = await tx.notification.create({
          data: {
            title: title || subject || "Untitled",
            message: message || "",
            type,
            priority,
            target: notificationTarget,
            userId: notificationUserId,

            ctaLabel: cta?.label || null,
            ctaUrl: cta?.url || null,
            bannerUrl: bannerUrl || null,

            sendInApp,
            sendEmail,
            sendPush,

            sendMode,
            scheduledAt: scheduledDate,
            expiryDays,
            expiresAt,

            emailSubject: subject || title,
            emailTemplate: htmlTemplate || null,

            totalTargets: users.length,
            status: sendMode === "LATER" ? "SCHEDULED" : "PROCESSING",
            createdById: adminId,

            inAppCreated: 0,
            pushSent: 0,
            emailSent: 0,
          },
        });

        const deliveryRecords = [];

        for (const user of users) {
          if (sendInApp) {
            deliveryRecords.push({
              notificationId: notification.id,
              userId: user.id,
              channel: "in_app",
              status: "queued",
            });
          }
          if (sendEmail && user.email && user.emailSubscribed) {
            deliveryRecords.push({
              notificationId: notification.id,
              userId: user.id,
              channel: "email",
              status: "queued",
              emailAddress: user.email,
            });
          }
          if (sendPush) {
            deliveryRecords.push({
              notificationId: notification.id,
              userId: user.id,
              channel: "push",
              status: "queued",
            });
          }
        }

        if (deliveryRecords.length > 0) {
          await tx.deliveryTracking.createMany({ data: deliveryRecords });
        }

        return notification;
      });

      console.log(`Notification created: ${createdNotification.id}`);

      // ------------------ scheduled (stop here) ------------------
      if (sendMode === "LATER") {
        await this.logAdminAction(
          adminId,
          "BROADCAST_SCHEDULED",
          null,
          `Broadcast scheduled (${target}) id=${createdNotification.id}`,
          req.ip,
          { notificationId: createdNotification.id, target, usersCount: users.length }
        );

        return res.status(200).json({
          success: true,
          message: "Broadcast scheduled successfully",
          scheduled: true,
          notification: createdNotification,
          totalUsers: users.length,
        });
      }

      // ------------------ deliver now ------------------
      let inAppCreated = 0;
      let pushSent = 0;
      let emailSent = 0;

      // 1) in-app
      if (sendInApp) {
        try {
          await prisma.userNotification.createMany({
            data: users.map((u) => ({
              userId: u.id,
              notificationId: createdNotification.id,
              isRead: false,
            })),
          });

          inAppCreated = users.length;

          await prisma.deliveryTracking.updateMany({
            where: {
              notificationId: createdNotification.id,
              channel: "in_app",
            },
            data: { status: "sent", sentAt: new Date() },
          });
        } catch (err) {
          console.error("In-app delivery failed:", err.message);

          await prisma.deliveryTracking.updateMany({
            where: { notificationId: createdNotification.id, channel: "in_app" },
            data: { status: "failed", errorMessage: err.message.substring(0, 200) },
          });
        }
      }

      // 2) push
      if (sendPush) {
        try {
          const pushTokens = await prisma.pushToken.findMany({
            where: { userId: { in: users.map((u) => u.id) } },
            select: { token: true, userId: true },
          });

          const tokens = pushTokens.map((p) => p.token).filter(Boolean);

          if (tokens.length > 0) {
            const pushResult = await sendPushToTokens(tokens, {
              title: title || subject || "Notification",
              body: message || "",
              data: {
                type,
                notificationId: createdNotification.id,
                ctaUrl: cta?.url || "",
                priority,
              },
            });

            pushSent = pushResult.successCount || 0;

            // mark push for all recipients as sent/failed based on result
            await prisma.deliveryTracking.updateMany({
              where: { notificationId: createdNotification.id, channel: "push" },
              data: { status: pushSent > 0 ? "sent" : "failed", sentAt: new Date() },
            });
          }
        } catch (err) {
          console.error("Push delivery failed:", err.message);
          await prisma.deliveryTracking.updateMany({
            where: { notificationId: createdNotification.id, channel: "push" },
            data: { status: "failed", errorMessage: err.message.substring(0, 200) },
          });
        }
      }

      // update fast channels
      await prisma.notification.update({
        where: { id: createdNotification.id },
        data: {
          inAppCreated,
          pushSent,
        },
      });

      // 3) email background (do NOT block response)
      if (sendEmail) {
        const finalSubject = subject || title || "Notification";
        const emailTargets = users.filter((u) => u.email && u.emailSubscribed);

        (async () => {
          try {
            let successCount = 0;
            let failCount = 0;

            const BATCH_SIZE = 10;
            const BATCH_DELAY = 1500;

            for (let i = 0; i < emailTargets.length; i += BATCH_SIZE) {
              const batch = emailTargets.slice(i, i + BATCH_SIZE);

              const results = await Promise.allSettled(
                batch.map(async (user) => {
                  try {
                    let htmlContent = `<p>${message || ""}</p>`;

                    if (htmlTemplate) {
                      htmlContent = await ejs.render(htmlTemplate, {
                        name: user.name || "User",
                        email: user.email,
                        message: message || "",
                        unsubscribeUrl: `${process.env.APP_URL || "http://localhost:5173"}/unsubscribe/${user.id}`,
                        notificationId: createdNotification.id,
                        appName: process.env.APP_NAME || "Our App",
                      });
                    }

                    await emailService.sendHtmlEmail(user.email, finalSubject, htmlContent);

                    await prisma.deliveryTracking.updateMany({
                      where: {
                        notificationId: createdNotification.id,
                        userId: user.id,
                        channel: "email",
                      },
                      data: { status: "sent", sentAt: new Date() },
                    });

                    successCount++;
                  } catch (err) {
                    await prisma.deliveryTracking.updateMany({
                      where: {
                        notificationId: createdNotification.id,
                        userId: user.id,
                        channel: "email",
                      },
                      data: {
                        status: "failed",
                        errorMessage: (err.message || "Email failed").substring(0, 200),
                        updatedAt: new Date(),
                      },
                    });

                    failCount++;
                  }
                })
              );

              if (i + BATCH_SIZE < emailTargets.length) {
                await new Promise((r) => setTimeout(r, BATCH_DELAY));
              }
            }

            emailSent = successCount;

            // final notification status after email
            const newStatus =
              successCount > 0 && failCount > 0
                ? "PARTIAL"
                : successCount > 0
                  ? "COMPLETED"
                  : "FAILED";

            await prisma.notification.update({
              where: { id: createdNotification.id },
              data: {
                emailSent: successCount,
                status: newStatus,
                updatedAt: new Date(),
              },
            });

            console.log(
              `✅ Email sending finished for ${createdNotification.id} success=${successCount}, failed=${failCount}`
            );
          } catch (err) {
            console.error("Background email processing crash:", err.message);

            await prisma.notification.update({
              where: { id: createdNotification.id },
              data: { status: "FAILED", updatedAt: new Date() },
            });
          }
        })();
      } else {
        // if no email, we can finish immediately
        await prisma.notification.update({
          where: { id: createdNotification.id },
          data: { status: "COMPLETED", updatedAt: new Date() },
        });
      }

      await this.logAdminAction(
        adminId,
        "BROADCAST_NOTIFICATION_SENT",
        null,
        `Broadcast sent (${target}) inApp=${sendInApp} push=${sendPush} email=${sendEmail}`,
        req.ip,
        {
          notificationId: createdNotification.id,
          target,
          inAppCreated,
          pushSent,
          emailProcessing: sendEmail,
        }
      );

      return res.status(200).json({
        success: true,
        message: "Broadcast accepted",
        notificationId: createdNotification.id,
        target,
        totalUsers: users.length,
        inAppCreated,
        pushSent,
        emailQueued: sendEmail ? users.filter((u) => u.email && u.emailSubscribed).length : 0,
        status: sendEmail ? "PROCESSING" : "COMPLETED",
      });
    } catch (err) {
      console.error("Admin sendBroadcast error:", err.message);
      console.error(err);

      return res.status(500).json({
        success: false,
        message: err.message || "Failed to send broadcast",
      });
    }
  }

  // -----------------------------------------------------------
  // SCHEDULED BROADCASTS MANAGEMENT
  // -----------------------------------------------------------

  async getScheduledBroadcasts(req, res) {
    try {
      const scheduled = await prisma.notification.findMany({
        where: {
          sendMode: "LATER",
          status: { in: ["SCHEDULED", "DRAFT"] },
          scheduledAt: { gt: new Date() },
        },
        orderBy: { scheduledAt: 'asc' },
        include: {
          createdBy: {
            select: { name: true, email: true },
          },
        },
      });

      res.status(200).json({
        success: true,
        scheduled,
      });
    } catch (err) {
      console.error('Admin getScheduledBroadcasts error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch scheduled broadcasts' });
    }
  }

  async cancelScheduledBroadcast(req, res) {
    try {
      const adminId = req.user.id;
      const notificationId = req.params.id;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }

      if (notification.sendMode !== "LATER") {
        return res.status(400).json({
          success: false,
          message: 'Only scheduled broadcasts can be cancelled',
        });
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: {
          sendMode: "CANCELLED",
          status: "CANCELLED",
        },
      });

      await this.logAdminAction(
        adminId,
        "BROADCAST_CANCELLED",
        null,
        `Cancelled scheduled broadcast: ${notification.title}`,
        req.ip,
        { notificationId }
      );

      res.status(200).json({
        success: true,
        message: 'Scheduled broadcast cancelled successfully',
        notification: updated,
      });
    } catch (err) {
      console.error('Admin cancelScheduledBroadcast error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to cancel scheduled broadcast' });
    }
  }

  // -----------------------------------------------------------
  // EMAIL TEMPLATES
  // -----------------------------------------------------------

  async getEmailTemplates(req, res) {
    try {
      const templates = await prisma.emailTemplate.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
        include: {
          createdBy: {
            select: { name: true, email: true },
          },
        },
      });

      res.status(200).json({
        success: true,
        templates,
      });
    } catch (err) {
      console.error('Admin getEmailTemplates error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch email templates' });
    }
  }

  async createEmailTemplate(req, res) {
    try {
      const adminId = req.user.id;
      const { name, subject, htmlContent, type, variables } = req.body;

      if (!name || !subject || !htmlContent) {
        return res.status(400).json({
          success: false,
          message: 'Name, subject, and htmlContent are required',
        });
      }

      const template = await prisma.emailTemplate.create({
        data: {
          name,
          subject,
          htmlContent,
          type: type || 'GENERIC',
          variables: variables || ['name', 'email', 'message', 'unsubscribeUrl'],
          createdById: adminId,
        },
      });

      await this.logAdminAction(
        adminId,
        'EMAIL_TEMPLATE_CREATED',
        null,
        `Created email template: ${name}`,
        req.ip
      );

      res.status(201).json({
        success: true,
        message: 'Email template created successfully',
        template,
      });
    } catch (err) {
      console.error('Admin createEmailTemplate error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to create email template' });
    }
  }

  async updateEmailTemplate(req, res) {
    try {
      const adminId = req.user.id;
      const templateId = req.params.id;
      const { name, subject, htmlContent, type, variables, isActive } = req.body;

      const template = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        return res.status(404).json({ success: false, message: 'Email template not found' });
      }

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (subject !== undefined) updateData.subject = subject;
      if (htmlContent !== undefined) updateData.htmlContent = htmlContent;
      if (type !== undefined) updateData.type = type;
      if (variables !== undefined) updateData.variables = variables;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await prisma.emailTemplate.update({
        where: { id: templateId },
        data: updateData,
      });

      await this.logAdminAction(
        adminId,
        'EMAIL_TEMPLATE_UPDATED',
        null,
        `Updated email template: ${template.name}`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Email template updated successfully',
        template: updated,
      });
    } catch (err) {
      console.error('Admin updateEmailTemplate error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to update email template' });
    }
  }

  async deleteEmailTemplate(req, res) {
    try {
      const adminId = req.user.id;
      const templateId = req.params.id;

      const template = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        return res.status(404).json({ success: false, message: 'Email template not found' });
      }

      // Soft delete by setting isActive to false
      await prisma.emailTemplate.update({
        where: { id: templateId },
        data: { isActive: false },
      });

      await this.logAdminAction(
        adminId,
        'EMAIL_TEMPLATE_DELETED',
        null,
        `Deleted email template: ${template.name}`,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Email template deleted successfully',
      });
    } catch (err) {
      console.error('Admin deleteEmailTemplate error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to delete email template' });
    }
  }

  // -----------------------------------------------------------
  // BROADCAST ANALYTICS
  // -----------------------------------------------------------

  async getBroadcastAnalytics(req, res) {
    try {
      const notificationId = req.params.id;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          id: true,
          title: true,
          createdAt: true,
          inAppCreated: true,
          pushSent: true,
          emailSent: true,
          totalTargets: true,
        },
      });

      if (!notification) {
        return res.status(404).json({ success: false, message: 'Notification not found' });
      }

      // Get delivery stats by channel
      const deliveryStats = await prisma.deliveryTracking.groupBy({
        by: ['channel', 'status'],
        where: { notificationId },
        _count: true,
      });

      // Get read stats for in-app notifications
      const readStats = await prisma.userNotification.groupBy({
        by: ['isRead'],
        where: { notificationId },
        _count: true,
      });

      // Get hourly engagement
      const hourlyEngagement = await prisma.deliveryTracking.groupBy({
        by: ['hour'],
        _count: true,
        where: {
          notificationId,
          status: { in: ['opened', 'clicked'] },
        },
      });

      const totalSent = notification.inAppCreated + notification.pushSent + notification.emailSent;
      const openRate = notification.inAppCreated > 0
        ? (readStats.find(s => s.isRead)?._count || 0) / notification.inAppCreated * 100
        : 0;

      res.status(200).json({
        success: true,
        notification,
        stats: {
          totalSent,
          totalTargets: notification.totalTargets,
          deliveryRate: notification.totalTargets > 0 ? (totalSent / notification.totalTargets * 100) : 0,
          openRate,
          deliveryStats,
          readStats,
          hourlyEngagement,
        },
      });
    } catch (err) {
      console.error('Admin getBroadcastAnalytics error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch broadcast analytics' });
    }
  }

  async getAllBroadcastAnalytics(req, res) {
    try {
      const { startDate, endDate, channel } = req.query;

      const where = {};

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      if (channel) {
        where.channel = channel;
      }

      const analytics = await prisma.deliveryTracking.groupBy({
        by: ['notificationId', 'channel', 'status'],
        where,
        _count: true,
      });

      // Aggregate by notification
      const notificationStats = {};
      analytics.forEach(stat => {
        if (!notificationStats[stat.notificationId]) {
          notificationStats[stat.notificationId] = {
            notificationId: stat.notificationId,
            total: 0,
            byChannel: {},
            byStatus: {},
          };
        }

        notificationStats[stat.notificationId].total += stat._count;

        if (!notificationStats[stat.notificationId].byChannel[stat.channel]) {
          notificationStats[stat.notificationId].byChannel[stat.channel] = 0;
        }
        notificationStats[stat.notificationId].byChannel[stat.channel] += stat._count;

        if (!notificationStats[stat.notificationId].byStatus[stat.status]) {
          notificationStats[stat.notificationId].byStatus[stat.status] = 0;
        }
        notificationStats[stat.notificationId].byStatus[stat.status] += stat._count;
      });

      res.status(200).json({
        success: true,
        analytics: Object.values(notificationStats),
      });
    } catch (err) {
      console.error('Admin getAllBroadcastAnalytics error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
  }

  // -----------------------------------------------------------
  // ADMIN STATS
  // -----------------------------------------------------------

  async getAdminStats(req, res) {
    try {
      const [
        totalUsers,
        activeUsers,
        suspendedUsers,
        adminCount,
        totalNotifications,
        scheduledNotifications,
        emailTemplates,
        recentBroadcasts,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { isActive: false } }),
        prisma.user.count({ where: { role: 'ADMIN' } }),
        prisma.notification.count(),
        prisma.notification.count({ where: { sendMode: 'LATER', status: 'SCHEDULED' } }),
        prisma.emailTemplate.count({ where: { isActive: true } }),
        prisma.notification.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            totalTargets: true,
            createdAt: true,
          },
        }),
      ]);

      // Get delivery stats for last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const deliveryStats = await prisma.deliveryTracking.groupBy({
        by: ['channel', 'status'],
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
        _count: true,
      });

      res.status(200).json({
        success: true,
        stats: {
          totalUsers,
          activeUsers,
          suspendedUsers,
          adminCount,
          totalNotifications,
          scheduledNotifications,
          emailTemplates,
          deliveryStats,
        },
        recentBroadcasts,
      });
    } catch (err) {
      console.error('Admin getAdminStats error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch admin stats' });
    }
  }

  async getAuditLogs(req, res) {
    try {
      const { page = 1, limit = 50, actionType, adminId } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const where = {};
      if (actionType) where.actionType = actionType;
      if (adminId) where.adminId = adminId;

      const [total, logs] = await Promise.all([
        prisma.adminAuditLog.count({ where }),
        prisma.adminAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit),
          include: {
            admin: {
              select: { id: true, name: true, email: true },
            },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      console.error('Admin getAuditLogs error:', err.message);
      res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
    }
  }
}

AdminController.AdminPermission = {
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_ADMINS: 'MANAGE_ADMINS',
  SEND_BROADCASTS: 'SEND_BROADCASTS',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  MANAGE_SYSTEM_SETTINGS: 'MANAGE_SYSTEM_SETTINGS',
  VIEW_ANALYTICS: 'VIEW_ANALYTICS',
  EXPORT_DATA: 'EXPORT_DATA',
  MANAGE_ROLES: 'MANAGE_ROLES',
  SCHEDULE_BROADCASTS: 'SCHEDULE_BROADCASTS',
};

module.exports = new AdminController();