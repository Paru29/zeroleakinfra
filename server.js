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
const db = require('./src/db');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Nginx) for secure cookies

// Passport Setup (Serialization)
passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((user, done) => {
  done(null, user);
});

// Configure Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
    },
    async function(accessToken, refreshToken, profile, cb) {
      try {
        const email = profile.emails[0].value;
        const googleId = profile.id;

        // Try to find by google_id or email(username)
        let tenant = await db('tenants').where({ google_id: googleId }).first();
        if (!tenant) {
          tenant = await db('tenants').where({ username: email }).first();
          if (tenant) {
            // Update existing with google_id
            await db('tenants').where({ id: tenant.id }).update({ google_id: googleId });
          } else {
            // Create new tenant
            const tenantId = `tenant_${Date.now()}`;
            await db('tenants').insert({
              id: tenantId,
              username: email,
              google_id: googleId,
              brand_name: profile.displayName || email,
              domain: `${tenantId}.myshopify.com`,
              shopify_config: '{}',
              meta_config: '{}',
              tracking_config: '{}'
            });
            tenant = await db('tenants').where({ id: tenantId }).first();
          }
        }
        return cb(null, tenant);
      } catch (err) {
        return cb(err, null);
      }
    }
  ));
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
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

app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication
    req.session.admin_auth = true;
    req.session.role = 'client';
    req.session.tenant_id = req.user.id;
    req.session.save(() => {
      res.redirect('/dashboard');
    });
  }
);

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
      res.redirect('/dashboard');
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

app.get('/signup', (req, res) => {
  if (req.session && req.session.admin_auth === true) {
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public/signup.html'));
  }
});

app.post('/signup', async (req, res) => {
  const { username, password, mobile_no } = req.body;
  
  if (!username || !password || !mobile_no) {
    return res.status(400).send('Username, Password and Mobile No are required');
  }

  // Generate temporary brand and domain, the user can link actual details later
  const tenantId = `tenant_${Date.now()}`;
  const brand_name = username;
  const domain = `${tenantId}.myshopify.com`;

  try {
    const existing = await db('tenants').where({ username }).first();
    if (existing) {
      return res.status(400).send('Username already exists. Please choose another.');
    }

    const password_hash = await bcrypt.hash(password, 10);
    
    await db('tenants').insert({
      id: tenantId,
      username,
      password_hash,
      brand_name,
      domain,
      mobile_no,
      shopify_config: '{}',
      meta_config: '{}',
      tracking_config: '{}'
    });

    // Auto-login after signup
    req.session.admin_auth = true;
    req.session.role = 'client';
    req.session.tenant_id = tenantId;
    req.session.save(() => {
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('Signup error', err);
    res.status(500).send('Internal server error during signup');
  }
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
    res.redirect('/dashboard');
  } else {
    res.sendFile(path.join(__dirname, 'public/login.html'));
  }
});

app.get('/login', (req, res) => {
  res.redirect('/');
});

// Serve static frontend files (skipping protected directories)
app.use((req, res, next) => {
  if (req.path.startsWith('/dashboard') || req.path.startsWith('/admin')) {
    // Skip static serving for these routes, let the specific handlers deal with it
    return next();
  }
  return express.static(path.join(__dirname, 'public'))(req, res, next);
});

// Protect dashboard (Both Client and Master Admin now use this)
app.use('/dashboard', requireAuth, express.static(path.join(__dirname, 'public/dashboard')));

// Legacy admin route redirects to dashboard
app.use('/admin', (req, res) => res.redirect('/dashboard'));

// Get current user info for frontend routing
app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    role: req.session.role,
    tenant_id: req.session.tenant_id || null
  });
});

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
const billingRoutes = require('./src/routes/billing');

app.use('/api', trackingRoutes);
app.use('/api', checkoutRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/meta', requireAuth, metaRoutes);
app.use('/api/shopify', requireAuth, shopifyRoutes);
app.use('/api/billing', requireAuth, billingRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

module.exports = app;