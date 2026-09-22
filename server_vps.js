require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined
});

const session = require('express-session');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Nginx) for secure cookies

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://via.placeholder.com", "https://*"],
      connectSrc: ["'self'", "https://*"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));
app.use(cors());

// Logging
app.use(morgan('combined'));

// Body parsing with rawBody capture for webhooks
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl.startsWith('/api/webhooks/shopify')) {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true }));

// Session Setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'super-secret-zeroleak-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to false to allow HTTP access during testing/deployment without SSL
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// --- Admin Login Logic ---
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@123';

const bcrypt = require('bcryptjs');

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Master Admin Login
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.admin_auth = true;
    req.session.role = 'master_admin';
    req.session.save(() => {
      res.redirect('/admin');
    });
    return;
  }

  // Client Login
  try {
    const tenant = await db('tenants').where({ username }).first();
    if (tenant && tenant.password_hash) {
      const match = await bcrypt.compare(password, tenant.password_hash);
      if (match) {
        req.session.admin_auth = true;
        req.session.role = 'client';
        req.session.tenant_id = tenant.id;
        req.session.save(() => {
          res.redirect('/dashboard');
        });
        return;
      }
    }
  } catch (err) {
    console.error('Login error', err);
  }

  res.status(401).send('Invalid credentials');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Middleware to protect routes
const requireAuth = (req, res, next) => {
  if (req.session && req.session.admin_auth === true) {
    next();
  } else {
    // If it's an API route, send 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/');
  }
};

const requireMasterAdmin = (req, res, next) => {
  if (req.session && req.session.admin_auth === true && req.session.role === 'master_admin') {
    next();
  } else {
    res.redirect('/');
  }
};

// Root route
app.get('/', (req, res) => {
  if (req.session && req.session.admin_auth === true) {
    res.redirect(req.session.role === 'master_admin' ? '/admin' : '/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public/login.html'));
  }
});

// Serve static frontend files (skipping protected directories)
app.use((req, res, next) => {
  if (req.path.startsWith('/dashboard') || req.path.startsWith('/admin')) {
    // Skip static serving for these routes, let the specific handlers deal with it
    return next('route');
  }
  next();
}, express.static(path.join(__dirname, 'public')));

// Protect dashboard
app.use('/dashboard', requireAuth, (req, res, next) => {
  if (req.session.role === 'master_admin') {
    return res.redirect('/admin');
  }
  next();
}, express.static(path.join(__dirname, 'public/dashboard')));

// Protect master admin
app.use('/admin', requireMasterAdmin, express.static(path.join(__dirname, 'public/admin')));

// Healthcheck
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// We will attach routes here in later iterations
const trackingRoutes = require('./src/routes/tracking');
const checkoutRoutes = require('./src/routes/checkout');
const webhookRoutes = require('./src/routes/webhooks');
const dashboardRoutes = require('./src/routes/dashboard');
const metaRoutes = require('./src/routes/meta');
const shopifyRoutes = require('./src/routes/shopify');
const adminRoutes = require('./src/routes/admin');

app.use('/api', trackingRoutes);
app.use('/api', checkoutRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/meta', requireAuth, metaRoutes);
app.use('/api/shopify', requireAuth, shopifyRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

module.exports = app;