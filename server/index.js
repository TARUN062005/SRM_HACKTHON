const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Load environment variables FIRST
dotenv.config();

// Import database connection
const { ConnectDb } = require('./utils/dbConnector');

// ✅ IMPORTANT: Add BroadcastScheduler
const BroadcastScheduler = require('./utils/cron/broadcastScheduler');

// ✅ IMPORTANT: Import EmailService for the scheduler
const EmailService = require('./src/core/services/EmailService');

// Seed admin
const { seedAdmin } = require('./utils/seedAdmin');

// --- ROUTES ---
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');

// ✅ NEW: Push token routes
const userPushRoutes = require('./routes/userPushRoutes');
const aiRoutes = require('./routes/ai.routes');

const app = express();

// ✅ INITIALIZE BROADCAST SCHEDULER (IMPORTANT FOR SCHEDULED NOTIFICATIONS)
let broadcastScheduler;
let emailService;

// Initialize services
const initializeServices = async () => {
  try {
    // Initialize EmailService
    emailService = new EmailService();
    console.log('✅ EmailService initialized');
    
    // Initialize and start BroadcastScheduler
    broadcastScheduler = new BroadcastScheduler(emailService);
    broadcastScheduler.start();
    console.log('✅ BroadcastScheduler started');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error.message);
    // Don't crash the server, but log the error
  }
};

/**
 * ------------------ SECURITY MIDDLEWARE ------------------
 */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        fontSrc: ["'self'", 'https:', 'data:'],
      },
    },

    crossOriginEmbedderPolicy: false,
  })
);

/**
 * ------------------ CORS CONFIG ------------------
 *
 * Supports multiple origins:
 * Example .env:
 * CLIENT_URL=http://localhost:5173,http://localhost:5174
 */
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

console.log('✅ Allowed CORS origins:', allowedOrigins);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Always allow Replit preview/proxy domains
    if (origin.endsWith('.replit.dev') || origin.endsWith('.repl.co') || origin.endsWith('.sisko.replit.dev')) {
      return callback(null, true);
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️  CORS warning: Allowing non-listed origin in development: ${origin}`);
      return callback(null, true);
    }

    console.error(`❌ CORS blocked: ${origin} not in allowed list`);
    return callback(new Error(`CORS policy: Origin ${origin} is not allowed`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Normalize multiple consecutive slashes in URL to prevent issues like `/api/auth/google//callback`
app.use((req, res, next) => {
  const normalized = req.url.replace(/\/{2,}/g, '/');
  if (normalized !== req.url) {
    console.warn(`⚠️ Normalized URL ${req.url} -> ${normalized}`);
    req.url = normalized;
  }
  next();
});

/**
 * ------------------ RATE LIMITERS ------------------
 */

const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'rate_limit_exceeded',
    retryAfter: '15 minutes',
    suggestion: 'Too many login attempts. Please try again later.',
  },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'admin_rate_limit_exceeded',
  },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'too_many_requests',
  },
});

// Apply strict limits to auth actions
app.use('/api/auth/login', authActionLimiter);
app.use('/api/auth/register', authActionLimiter);
app.use('/api/auth/google', authActionLimiter);
app.use('/api/auth/github', authActionLimiter);
app.use('/api/auth/facebook', authActionLimiter);
app.use('/api/auth/magic-link', authActionLimiter);
app.use('/api/auth/verify-magic', authActionLimiter);
app.use('/api/auth/forgot-password', authActionLimiter);
app.use('/api/auth/reset-password', authActionLimiter);

// Apply admin limiter
app.use('/api/admin', adminLimiter);

// Apply general limiter
app.use('/api/user', generalLimiter);
app.use('/api', generalLimiter);

/**
 * ------------------ BODY PARSERS ------------------
 */
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
    parameterLimit: 10000,
  })
);

/**
 * ------------------ REQUEST LOGGING ------------------
 */
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] 📥 ${req.method} ${req.originalUrl}`, {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent']?.substring(0, 100) || 'Unknown',
    origin: req.headers.origin || 'No origin',
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusColor = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅';
    console.log(
      `[${new Date().toISOString()}] ${statusColor} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
});

/**
 * ------------------ STATIC SERVING ------------------
 */
app.use('/templates', express.static(path.join(__dirname, 'templates')));

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    maxAge: '1d',
    setHeaders: (res, p) => {
      if (
        p.endsWith('.jpg') ||
        p.endsWith('.jpeg') ||
        p.endsWith('.png') ||
        p.endsWith('.gif') ||
        p.endsWith('.webp')
      ) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  })
);

if (process.env.SERVE_ADMIN_CLIENT === 'true') {
  app.use('/admin', express.static(path.join(__dirname, '../adminClient/dist')));
}

/**
 * ------------------ HEALTH & INFO ------------------
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      broadcastScheduler: broadcastScheduler ? 'active' : 'inactive',
      emailService: emailService ? 'active' : 'inactive',
    },
  });
});

// Public Firebase web config (safe to expose)
app.get('/api/config/firebase', (req, res) => {
  res.status(200).json({
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_WEB_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_WEB_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_WEB_APP_ID || '',
    measurementId: process.env.FIREBASE_WEB_MEASUREMENT_ID || '',
  });
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'All-Purpose API Server',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      user: '/api/user',
      push: '/api/user/push', // ✅ new
      admin: '/api/admin',
      uploads: '/uploads',
      health: '/health',
      docs: '/api/docs',
    },
    features: {
      broadcast: '✅ Enabled with scheduler support',
      pushNotifications: '✅ Enabled',
      emailTemplates: '✅ Enabled with EJS support',
      scheduledBroadcasts: '✅ Enabled',
      deliveryTracking: '✅ Enabled',
    },
    environment: process.env.NODE_ENV || 'development',
    cors: {
      allowedOrigins: allowedOrigins,
      status: 'active',
    },
  });
});

/**
 * ------------------ API ROUTES ------------------
 */
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

// ✅ NEW push registration routes (IMPORTANT for system/phone notifications)
app.use('/api/user/push', userPushRoutes);
app.use('/api/ai', aiRoutes);

app.use('/api/admin', adminRoutes);

/**
 * ------------------ API DOCS ------------------
 */
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'Application API Documentation',
    version: '1.0.0',
    baseUrl: process.env.BASE_URL || 'http://localhost:5000',
    features: {
      broadcastSystem: '✅ Complete with scheduling and analytics',
      emailTemplates: '✅ EJS template support',
      pushNotifications: '✅ Web/Android/iOS support',
      deliveryTracking: '✅ Real-time analytics',
    },
    endpoints: {
      auth: {
        public: [
          { method: 'POST', path: '/api/auth/register', description: 'Register a new user' },
          { method: 'POST', path: '/api/auth/login', description: 'Login user' },
          { method: 'POST', path: '/api/auth/magic-link', description: 'Request magic link' },
          { method: 'POST', path: '/api/auth/verify-magic', description: 'Verify magic link' },
          { method: 'GET', path: '/api/auth/google', description: 'Google OAuth' },
          { method: 'GET', path: '/api/auth/github', description: 'GitHub OAuth' },
          { method: 'GET', path: '/api/auth/facebook', description: 'Facebook OAuth' },
          { method: 'POST', path: '/api/auth/forgot-password', description: 'Forgot password' },
          { method: 'POST', path: '/api/auth/reset-password', description: 'Reset password' },
          { method: 'POST', path: '/api/auth/refresh', description: 'Refresh token' },
        ],
        protected: [
          { method: 'POST', path: '/api/auth/logout', description: 'Logout user' },
          { method: 'POST', path: '/api/auth/change-password', description: 'Change password' },
          { method: 'GET', path: '/api/auth/profile', description: 'Get auth profile' },
        ],
      },
      user: {
        protected: [
          { method: 'GET', path: '/api/user/profile', description: 'Fetch profile data' },
          { method: 'PATCH', path: '/api/user/settings', description: 'Update settings & upload image' },
          { method: 'GET', path: '/api/user/activity', description: 'Account activity logs' },
          { method: 'DELETE', path: '/api/user/account', description: 'Suspend/delete own account' },
          { method: 'POST', path: '/api/user/request-reactivation', description: 'Request account reactivation' },
        ],
      },
      push: {
        protected: [
          { method: 'POST', path: '/api/user/push/register', description: 'Register push token for web/mobile' },
          { method: 'DELETE', path: '/api/user/push/remove', description: 'Remove push token' },
        ],
      },
      admin: {
        public: [{ method: 'POST', path: '/api/admin/login', description: 'Admin login (public)' }],
        protected: [
          { method: 'GET', path: '/api/admin/me', description: 'Admin identity' },
          { method: 'GET', path: '/api/admin/users', description: 'List users with pagination' },
          { method: 'GET', path: '/api/admin/users/:id', description: 'Get user by ID' },
          { method: 'GET', path: '/api/admin/users/:id/activity', description: 'Get user activity logs' },
          { method: 'PATCH', path: '/api/admin/users/:id/suspend', description: 'Suspend user' },
          { method: 'PATCH', path: '/api/admin/users/:id/reactivate', description: 'Reactivate user' },
          { method: 'PATCH', path: '/api/admin/users/:id/role', description: 'Change user role' },
          { method: 'DELETE', path: '/api/admin/users/:id', description: 'Delete user permanently' },

          // Notification Management
          { method: 'GET', path: '/api/admin/notifications', description: 'Get all notifications with pagination' },
          { method: 'GET', path: '/api/admin/notifications/:id', description: 'Get notification with stats' },
          { method: 'PATCH', path: '/api/admin/notifications/:id', description: 'Update notification (cancel, etc.)' },
          { method: 'DELETE', path: '/api/admin/notifications/:id', description: 'Delete notification' },
          
          // Email Templates
          { method: 'GET', path: '/api/admin/email-templates', description: 'Get all email templates' },
          { method: 'POST', path: '/api/admin/email-templates', description: 'Create email template' },
          { method: 'PUT', path: '/api/admin/email-templates/:id', description: 'Update email template' },
          { method: 'DELETE', path: '/api/admin/email-templates/:id', description: 'Delete email template' },

          // Broadcast System
          { method: 'POST', path: '/api/admin/email/broadcast', description: 'Broadcast email to all users (legacy)' },
          { method: 'POST', path: '/api/admin/notifications/broadcast', description: 'Broadcast notifications (legacy)' },
          { method: 'POST', path: '/api/admin/notifications/user/:id', description: 'Send notification to specific user (legacy)' },
          
          // ✅ New Unified Broadcast System
          { method: 'POST', path: '/api/admin/broadcast/send', description: 'Unified broadcast (inApp/push/email) with scheduling' },
          { method: 'GET', path: '/api/admin/broadcast/scheduled', description: 'Get all scheduled broadcasts' },
          { method: 'DELETE', path: '/api/admin/broadcast/scheduled/:id', description: 'Cancel scheduled broadcast' },
          
          // Analytics
          { method: 'GET', path: '/api/admin/broadcast/analytics/:id', description: 'Get broadcast analytics by ID' },
          { method: 'GET', path: '/api/admin/broadcast/analytics', description: 'Get all broadcast analytics' },

          { method: 'GET', path: '/api/admin/stats', description: 'Get system statistics' },
          { method: 'GET', path: '/api/admin/audit', description: 'Get admin audit logs with pagination' },
        ],
      },
    },
    authentication: {
      user: 'Use Authorization: Bearer <token> header',
      admin: 'Use same token format, role must be ADMIN',
    },
    rateLimits: {
      auth: '15 requests per 15 minutes',
      user: '200 requests per 15 minutes',
      admin: '300 requests per 15 minutes',
    },
    broadcastFeatures: {
      scheduling: '✅ Send now or schedule for later',
      channels: '✅ In-app, Email, Push notifications',
      targeting: '✅ All users, Selected users, Single user',
      templates: '✅ EJS email templates with variables',
      analytics: '✅ Delivery tracking, open rates, click rates',
      ttl: '✅ Expiry days (0-365) for notifications',
      cta: '✅ Call-to-action buttons with custom URLs',
      priority: '✅ Normal, High, Urgent priority levels',
      bannerImages: '✅ Optional banner images for notifications',
    },
  });
});

/**
 * ------------------ 404 HANDLER ------------------
 */
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
    suggestion: 'Check /api/docs for available endpoints',
    timestamp: new Date().toISOString(),
  });
});

/**
 * ------------------ GLOBAL ERROR HANDLER ------------------
 */
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    origin: req.headers.origin,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  if (err.message && err.message.includes('CORS policy')) {
    return res.status(403).json({
      success: false,
      message: 'CORS: Origin not allowed',
      allowedOrigins: allowedOrigins,
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token',
      code: 'INVALID_TOKEN',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication token has expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
    });
  }

  if (err.code && err.code.startsWith('P')) {
    return res.status(400).json({
      success: false,
      message: 'Database operation failed',
      code: err.code,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const errorResponse = {
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
});

/**
 * ------------------ GRACEFUL SHUTDOWN ------------------
 */
let server;

const gracefulShutdown = async () => {
  console.log('🔄 Received shutdown signal, closing server gracefully...');

  try {
    // Stop the broadcast scheduler
    if (broadcastScheduler) {
      console.log('🔄 Stopping broadcast scheduler...');
      // Add a stop method to your BroadcastScheduler class if needed
    }

    if (server) {
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
    }

    setTimeout(() => {
      console.error('⚠️  Could not close server gracefully, forcing shutdown');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * ------------------ START SERVER ------------------
 */
const startServer = async () => {
  try {
    await ConnectDb();
    console.log('✅ Database connected successfully');

    // Initialize services
    await initializeServices();

    console.log('🔄 Checking/creating admin user...');
    const adminUser = await seedAdmin();
    if (adminUser) {
      console.log('✅ Admin user ready:', adminUser.email);
    } else {
      console.log('⚠️  Admin user already exists or could not be created');
    }

    const port = process.env.PORT || 8000;
    const host = '0.0.0.0';

    server = app.listen(port, host, () => {
      console.log('\n' + '='.repeat(70));
      console.log('🚀 SERVER STARTED SUCCESSFULLY!');
      console.log('='.repeat(70));
      console.log(`📍 Port: ${port}`);
      console.log(`🌐 Host: ${host}`);
      console.log(`🔄 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Allowed Origins: ${allowedOrigins.join(', ')}`);
      console.log('\n📊 FEATURES:');
      console.log('   • ✅ Complete Broadcast System with Scheduling');
      console.log('   • ✅ Email Templates (EJS support)');
      console.log('   • ✅ Push Notifications (Web/Android/iOS)');
      console.log('   • ✅ Delivery Tracking & Analytics');
      console.log('   • ✅ Rate Limiting & Security');
      console.log('\n🔗 ENDPOINTS:');
      console.log(`   • API: http://${host}:${port}/api`);
      console.log(`   • Auth: http://${host}:${port}/api/auth`);
      console.log(`   • User: http://${host}:${port}/api/user`);
      console.log(`   • Push: http://${host}:${port}/api/user/push`);
      console.log(`   • Admin: http://${host}:${port}/api/admin`);
      console.log(`   • Broadcast Scheduler: ACTIVE`);
      console.log(`   • Health: http://${host}:${port}/health`);
      console.log(`   • Docs: http://${host}:${port}/api/docs`);
      console.log('='.repeat(70) + '\n');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
} else {
  module.exports = { app, startServer };
}