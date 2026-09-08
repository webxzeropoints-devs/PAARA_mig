require('dotenv').config();
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'ADMIN_API_KEY'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error(`\n[STARTUP ERROR] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Copy .env.example to .env and fill in these values before starting the server.\n');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const db = require('./db/database.pg');
const { requireAdminSession } = require('./middleware/adminAuth');
const { maskSensitiveText } = require('./utils/validate');
const { formatOrderNumber } = require('./utils/orderNumber');

const productsRouter = require('./routes/products');
const vaultRouter = require('./routes/vault');
const shippingRouter = require('./routes/shipping');
const ordersRouter = require('./routes/orders');
const paymentRouter = require('./routes/payment');
const authRouter = require('./routes/auth');
const addressesRouter = require('./routes/addresses');
const emailAuthRouter = require('./routes/emailAuth');
const wishlistRouter = require('./routes/wishlist');
const adminRouter = require('./routes/admin');
const adminAuthRouter = require('./routes/adminAuth');
const couponsRouter = require('./routes/coupons');
const homepageRouter = require('./routes/homepage');
const loyaltyRouter = require('./routes/loyalty');
const paaraStoryRouter = require('./routes/paaraStory');

const app = express();

const normalizeOrigin = (origin) => {
  if (!origin) return null;

  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch (error) {
    return null;
  }
};

const buildAllowedOrigins = () => {
  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const defaultOrigins = [
    'https://paara.vercel.app',
    'https://paarajewellery.in',
    'https://www.paarajewellery.in',
    'http://localhost:3000',
    'http://localhost:4000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ];

  return [...new Set([...configuredOrigins, ...defaultOrigins])];
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const allowedOrigins = buildAllowedOrigins();
  if (allowedOrigins.includes(normalizedOrigin)) return true;

  const hostname = new URL(normalizedOrigin).hostname.toLowerCase();
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.localhost');
  const isVercelPreview = hostname.endsWith('.vercel.app') || hostname === 'vercel.app';

  return isLocalhost || isVercelPreview;
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, origin || true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Serve the shared public assets used by the storefront and local upload files.
app.use('/images', express.static(path.join(__dirname, '..', 'public', 'images')));
app.get('/images/blob/*', async (req, res) => {
  try {
    const pathname = decodeURIComponent(req.params[0] || '');
    if (!pathname || pathname.includes('..')) return res.status(404).end();
    const { get } = require('@vercel/blob');
    const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
    const storeId = String(process.env.BLOB_STORE_ID || '').trim();
    const blob = await get(pathname, { access: 'private', ...(token ? { token } : { storeId }) });
    if (!blob) return res.status(404).end();
    res.set('Content-Type', blob.blob.contentType || 'application/octet-stream');
    const reader = blob.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (error) {
    console.error('Private image delivery failed:', error);
    res.status(404).end();
  }
});
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Both Vercel and Render sit behind a reverse proxy that sets X-Forwarded-For.
// Without this, express-rate-limit can't safely derive client IPs and throws
// ERR_ERL_FORWARDED_HEADER on every rate-limited route.
app.set('trust proxy', 1);

if (db.isServerless) {
  app.use(async (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    let releaseLock;
    try {
      releaseLock = await db.acquireWriteLock();
      db.markWrite();
    } catch (error) {
      return next(error);
    }

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);
    let persistPromise = null;
    let lockReleased = false;
    const release = () => {
      if (lockReleased) return;
      lockReleased = true;
      releaseLock();
    };
    const reportPersistFailure = (err) => {
      console.error('[DB_PERSIST] Upload failed after local write; serving response anyway.', {
        method: req.method,
        path: req.path,
        error: err.message,
        errorName: err.name,
        errorCode: err.code,
      });
    };

    const persistBeforeResponse = () => {
      if (!persistPromise) {
        console.log('[DB_PERSIST] Request requires persistence.', { method: req.method, path: req.path });
        persistPromise = db.persist();
      }
      return persistPromise;
    };

    res.json = (body) => {
      persistBeforeResponse()
        .catch(reportPersistFailure)
        .then(() => {
          try {
            originalJson(body);
          } finally {
            release();
          }
        });
      return res;
    };
    res.send = (body) => {
      persistBeforeResponse()
        .catch(reportPersistFailure)
        .then(() => {
          try {
            originalSend(body);
          } finally {
            release();
          }
        });
      return res;
    };
    res.end = (...args) => {
      persistBeforeResponse()
        .catch(reportPersistFailure)
        .then(() => {
          try {
            originalEnd(...args);
          } finally {
            release();
          }
        });
      return res;
    };

    res.on('close', release);
    next();
  });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer setup for file uploads (in-memory storage for temporary processing)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Attach multer to request for admin routes
app.use('/api/admin', upload.array('images', 3));

// Tighter limit on admin login + OTP verify â€” same window as the customer
// phone-OTP limiter, slightly more headroom since admins may retry a few
// times during the dashboard 2-step flow.
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use('/api/admin-auth/login', adminLoginLimiter);

app.use('/api/auth', authRouter);
app.use('/api/auth/email', emailAuthRouter);
app.use('/api/addresses', addressesRouter);
app.use('/api/wishlist', wishlistRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin-auth', adminAuthRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/homepage', homepageRouter);
app.use('/api/products', productsRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/shipping', shippingRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/paara-story', paaraStoryRouter);

// TEMPORARY PATCH â€” remove when migrated to Postgres
app.get('/api/db-status', requireAdminSession, (req, res) => {
  res.json({ ok: true, ...db.getSyncStatus() });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Central error handler
app.use((err, req, res, next) => {
  console.error('[REQUEST_ERROR]', { message: maskSensitiveText(err.message), name: err.name, method: req.method, path: req.path });
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FIELD_VALUE'
      ? 'The submitted image data is too large. Choose the image file again and retry.'
      : err.code === 'LIMIT_FILE_SIZE'
        ? 'The image is too large. Please choose an image under 5 MB.'
        : 'The image upload request is invalid. Please try again.';
    return res.status(400).json({ ok: false, code: err.code, message });
  }
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && err.body !== undefined)) {
    return res.status(400).json({ ok: false, code: 'INVALID_REQUEST_BODY', message: 'The request body is invalid. Please try again.' });
  }
  res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
});

if (db.isServerless) {
  // Vercel calls this exported handler per-request; no app.listen here.
  module.exports = app;
} else {
  const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 4000;
  const server = app.listen(PORT, () => console.log(`Paara backend running on http://localhost:${PORT}`));

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the process using that port, then restart Paara.`);
      process.exitCode = 1;
    } else {
      console.error('Server error:', e);
      process.exitCode = 1;
    }
  });

  let shuttingDown = false;
  const gracefulShutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('Received kill signal, shutting down gracefully.');
    const forceTimer = setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      try { db.close(); } catch { /* already closed */ }
      process.exit(1);
    }, 10000);
    forceTimer.unref();
    server.close(() => {
      console.log('Closed out remaining connections.');
      console.log('Closing database connection...');
      try { db.close(); } catch { /* already closed */ }
      clearTimeout(forceTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', { message: maskSensitiveText(err.message), name: err.name });
    gracefulShutdown();
  });
}
