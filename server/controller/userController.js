const UserService = require('../src/core/services/UserService');
const ActivityService = require('../src/core/services/ActivityService');
const EmailService = require('../src/core/services/EmailService');
const AuthManager = require('../src/core/auth/AuthManager');
const { prisma } = require('../utils/dbConnector');

const userService = new UserService();
const emailService = new EmailService();
const authManager = new AuthManager();

class UserController {
  /**
   * GET /api/user/profile
   */
  async getProfile(req, res) {
    try {
      const user = await userService.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        user: userService.sanitize(user),
      });
    } catch (error) {
      console.error('getProfile error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
  }

  /**
   * POST /api/user/active-ping
   */
  async activePing(req, res) {
    try {
      const GeoRiskWarmupService = require('../services/GeoRiskWarmupService');
      GeoRiskWarmupService.userPing(req.user.id);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('activePing error:', error);
      return res.status(500).json({ success: false });
    }
  }

  /**
   * PATCH /api/user/settings
   * Supports:
   * - multipart/form-data with profileImage
   * - text updates (name, bio, gender, phone, dob, location, country)
   */
  async updateSettings(req, res) {
    try {
      const { name, bio, gender, phone, dob, location, country } = req.body;

      const updateData = {};

      if (typeof name !== 'undefined') updateData.name = name;
      if (typeof bio !== 'undefined') updateData.bio = bio;

      if (typeof gender !== 'undefined' && gender !== '') updateData.gender = gender;
      if (typeof phone !== 'undefined') updateData.phone = phone;

      if (typeof dob !== 'undefined' && dob !== '') {
        const parsedDob = new Date(dob);
        if (isNaN(parsedDob.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid date of birth' });
        }
        updateData.dob = parsedDob;
      }

      if (typeof location !== 'undefined') updateData.location = location;
      if (typeof country !== 'undefined') updateData.country = country;

      // Handle profile image upload (multer attaches file at req.file)
      if (req.file) {
        const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        updateData.profileImage = publicUrl;
      }

      const updatedUser = await userService.update(req.user.id, updateData);

      await ActivityService.log(
        req.user.id,
        'Profile Updated',
        'User changed account details',
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        user: userService.sanitize(updatedUser),
      });
    } catch (error) {
      console.error('updateSettings error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /api/user/activity
   */
  async getActivityLogs(req, res) {
    try {
      const logs = await ActivityService.getRecentActivity(req.user.id);
      return res.status(200).json({ success: true, logs });
    } catch (error) {
      console.error('getActivityLogs error:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
    }
  }

  /**
   * DELETE /api/user/account?type=suspend|permanent
   */
  async deleteAccount(req, res) {
    try {
      const { type } = req.query;

      if (type === 'permanent') {
        await userService.deleteAllUserSessions(req.user.id);
        await userService.delete(req.user.id);

        return res.status(200).json({
          success: true,
          message: 'Account permanently deleted',
        });
      }

      // Suspend
      await userService.update(req.user.id, { isActive: false });
      await userService.deleteAllUserSessions(req.user.id);

      await ActivityService.log(
        req.user.id,
        'Account Suspended',
        'User manually suspended account',
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: 'Account suspended successfully',
      });
    } catch (error) {
      console.error('deleteAccount error:', error);
      return res.status(500).json({ success: false, message: 'Action failed' });
    }
  }

  /**
   * POST /api/user/logout-all
   */
  async logoutAllSessions(req, res) {
    try {
      await userService.deleteAllUserSessions(req.user.id);

      res.clearCookie('access_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });
      res.clearCookie('XSRF-TOKEN', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      });

      await ActivityService.log(
        req.user.id,
        'Sessions Terminated',
        'User logged out from all sessions',
        req.ip
      );

      return res.status(200).json({ success: true, message: 'All sessions logged out successfully' });
    } catch (error) {
      console.error('logoutAllSessions error:', error);
      return res.status(500).json({ success: false, message: 'Failed to terminate sessions' });
    }
  }

  /**
   * POST /api/user/request-reactivation
   */
  async requestReactivation(req, res) {
    try {
      const { email } = req.body;

      const user = await userService.findByEmail(email);

      if (!user || user.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Account is not suspended or not found',
        });
      }

      const token = authManager.generateMagicToken(email);

      await userService.createOTP({
        userId: user.id,
        identifier: email,
        code: token.token,
        type: 'VERIFICATION',
        expiresAt: token.expiresAt,
      });

      const reactivateUrl = `${process.env.CLIENT_URL}/reactivate?token=${token.token}`;

      await emailService.sendGenericEmail(
        email,
        'Reactivate Your Account',
        `Click here to reactivate: ${reactivateUrl}`
      );

      return res.status(200).json({ success: true, message: 'Reactivation email sent' });
    } catch (error) {
      console.error('requestReactivation error:', error);
      return res.status(500).json({ success: false, message: 'Failed to process request' });
    }
  }

  // ===========================================================
  // ✅ UPDATED NOTIFICATIONS (COMPATIBLE WITH ADMIN BROADCAST)
  // ===========================================================

  /**
   * GET /api/user/notifications
   * Query:
   *  - mode=unreadCount  (fast unread count)
   *  - page, limit
   *  - type (SYSTEM, SECURITY, ANNOUNCEMENT, MARKETING)
   *  - priority (NORMAL, HIGH, URGENT)
   */
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;

      const mode = String(req.query.mode || '').trim();
      const type = req.query.type;
      const priority = req.query.priority;
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const skip = (page - 1) * limit;

      // ✅ unreadCount mode for bell dot
      if (mode === 'unreadCount') {
        const unreadCount = await prisma.userNotification.count({
          where: { 
            userId, 
            isRead: false,
            notification: {
              sendInApp: true, // Only count notifications sent via in-app
            }
          },
        });

        return res.status(200).json({
          success: true,
          unreadCount,
        });
      }

      const where = {
        userId,
        notification: {
          sendInApp: true, // Only fetch notifications that were sent via in-app
        }
      };

      if (type) {
        where.notification.type = type;
      }

      if (priority) {
        where.notification.priority = priority;
      }

      const total = await prisma.userNotification.count({ where });

      const notifications = await prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          notification: {
            include: {
              createdBy: {
                select: { name: true, email: true },
              },
            },
          },
        },
      });

      // Format response to include notification details
      const formattedNotifications = notifications.map(item => ({
        id: item.id,
        isRead: item.isRead,
        readAt: item.readAt,
        createdAt: item.createdAt,
        // Notification details
        notificationId: item.notification.id,
        title: item.notification.title,
        message: item.notification.message,
        type: item.notification.type,
        priority: item.notification.priority,
        bannerUrl: item.notification.bannerUrl,
        ctaLabel: item.notification.ctaLabel,
        ctaUrl: item.notification.ctaUrl,
        createdAt: item.notification.createdAt,
        sender: item.notification.createdBy,
      }));

      return res.status(200).json({
        success: true,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        notifications: formattedNotifications,
      });
    } catch (error) {
      console.error('getNotifications error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications',
      });
    }
  }

  /**
   * PATCH /api/user/notifications/read-all
   */
  async markAllNotificationsRead(req, res) {
    try {
      const userId = req.user.id;

      const unreadNotifications = await prisma.userNotification.findMany({
        where: { 
          userId, 
          isRead: false,
          notification: {
            sendInApp: true,
          }
        },
        include: {
          notification: true,
        },
      });

      // Update each notification
      for (const item of unreadNotifications) {
        await prisma.userNotification.update({
          where: { id: item.id },
          data: {
            isRead: true,
            readAt: new Date(),
          },
        });

        // Update delivery tracking for in-app
        await prisma.deliveryTracking.updateMany({
          where: {
            notificationId: item.notificationId,
            userId: item.userId,
            channel: 'in_app',
          },
          data: {
            status: 'opened',
            openedAt: new Date(),
          },
        });
      }

      await ActivityService.log(
        userId,
        'Notifications Read',
        'User marked all notifications read',
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
      });
    } catch (error) {
      console.error('markAllNotificationsRead error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark all as read',
      });
    }
  }

  /**
   * PATCH /api/user/notifications/:id/read
   */
  async markNotificationRead(req, res) {
    try {
      const userId = req.user.id;
      const userNotificationId = req.params.id;

      const item = await prisma.userNotification.findFirst({
        where: { 
          id: userNotificationId, 
          userId,
          notification: {
            sendInApp: true,
          }
        },
        include: {
          notification: true,
        },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found',
        });
      }

      const updated = await prisma.userNotification.update({
        where: { id: userNotificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      // Update delivery tracking
      await prisma.deliveryTracking.updateMany({
        where: {
          notificationId: item.notificationId,
          userId: item.userId,
          channel: 'in_app',
        },
        data: {
          status: 'opened',
          openedAt: new Date(),
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        notification: updated,
      });
    } catch (error) {
      console.error('markNotificationRead error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification read',
      });
    }
  }

  /**
   * POST /api/user/notifications/:id/click
   * Track when user clicks CTA button
   */
  async trackNotificationClick(req, res) {
    try {
      const userId = req.user.id;
      const notificationId = req.params.id;

      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found',
        });
      }

      // Check if user has access to this notification
      const userNotification = await prisma.userNotification.findFirst({
        where: {
          userId,
          notificationId,
        },
      });

      if (!userNotification) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      // Update delivery tracking for click
      await prisma.deliveryTracking.updateMany({
        where: {
          notificationId,
          userId,
          channel: 'in_app',
        },
        data: {
          status: 'clicked',
          clickedAt: new Date(),
        },
      });

      await ActivityService.log(
        userId,
        'Notification CTA Clicked',
        `Clicked CTA for notification: ${notification.title}`,
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: 'Click tracked successfully',
        ctaUrl: notification.ctaUrl,
      });
    } catch (error) {
      console.error('trackNotificationClick error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to track click',
      });
    }
  }

  // ===========================================================
  // ✅ UPDATED PUSH TOKENS
  // ===========================================================

  /**
   * POST /api/user/notifications/push-token
   * Body: { token, platform, deviceId }
   */
  async savePushToken(req, res) {
    try {
      const userId = req.user.id;
      const { token, platform = "WEB", deviceId } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: "push token required",
        });
      }

      // ✅ Store in PushToken model
      const saved = await prisma.pushToken.upsert({
        where: { token },
        update: {
          userId,
          platform,
          deviceId: deviceId || null,
          userAgent: req.headers["user-agent"] || null,
          lastUsed: new Date(),
        },
        create: {
          token,
          userId,
          platform,
          deviceId: deviceId || null,
          userAgent: req.headers["user-agent"] || null,
          lastUsed: new Date(),
        },
      });

      await ActivityService.log(
        userId,
        'Push Token Saved',
        `Saved push token for platform: ${platform}`,
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: "Push token saved successfully",
        pushToken: saved,
      });
    } catch (error) {
      console.error("savePushToken error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to save push token",
      });
    }
  }

  /**
   * GET /api/user/notifications/push-token
   * Get user's push tokens
   */
  async getPushTokens(req, res) {
    try {
      const userId = req.user.id;

      const pushTokens = await prisma.pushToken.findMany({
        where: { userId },
        orderBy: { lastUsed: 'desc' },
      });

      return res.status(200).json({
        success: true,
        pushTokens,
      });
    } catch (error) {
      console.error("getPushTokens error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch push tokens",
      });
    }
  }

  /**
   * DELETE /api/user/notifications/push-token
   * Body: { token }  (optional)
   * - If token is sent → delete that token only
   * - If not sent → delete ALL tokens for that user
   */
  async deletePushToken(req, res) {
    try {
      const userId = req.user.id;
      const { token } = req.body || {};

      // if token provided -> delete single
      if (token) {
        await prisma.pushToken.deleteMany({
          where: {
            userId,
            token,
          },
        });

        await ActivityService.log(
          userId,
          'Push Token Removed',
          'Removed single push token',
          req.ip
        );

        return res.status(200).json({
          success: true,
          message: "Push token removed",
        });
      }

      // else delete all push tokens for that user
      await prisma.pushToken.deleteMany({
        where: { userId },
      });

      await ActivityService.log(
        userId,
        'Push Tokens Cleared',
        'Removed all push tokens',
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: "All push tokens removed",
      });
    } catch (error) {
      console.error("deletePushToken error:", error);
      return res.status(500).json({ success: false, message: "Failed to disable push" });
    }
  }

  // ===========================================================
  // ✅ UPDATED EMAIL SUBSCRIPTION
  // ===========================================================

  /**
   * GET /api/user/email/subscription
   * Get email subscription status
   */
  async getEmailSubscription(req, res) {
    try {
      const userId = req.user.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { emailSubscribed: true, email: true },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      return res.status(200).json({
        success: true,
        subscribed: user.emailSubscribed,
        email: user.email,
      });
    } catch (error) {
      console.error('getEmailSubscription error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch subscription status',
      });
    }
  }

  /**
   * PATCH /api/user/email/subscription
   * Body: { subscribed: true/false }
   */
  async updateEmailSubscription(req, res) {
    try {
      const userId = req.user.id;
      const { subscribed } = req.body;

      if (typeof subscribed !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'subscribed must be boolean',
        });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { emailSubscribed: subscribed },
      });

      await ActivityService.log(
        userId,
        'Email Subscription Updated',
        `Email subscription ${subscribed ? 'enabled' : 'disabled'}`,
        req.ip
      );

      return res.status(200).json({
        success: true,
        message: subscribed
          ? 'Email subscription enabled'
          : 'Email subscription disabled',
      });
    } catch (error) {
      console.error('updateEmailSubscription error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update email subscription',
      });
    }
  }
}

module.exports = new UserController();