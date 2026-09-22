const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const requireMasterAdmin = (req, res, next) => {
  if (req.session && req.session.admin_auth === true && req.session.role === 'master_admin') {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

router.use(requireMasterAdmin);

// List clients
router.get('/clients', async (req, res) => {
  try {
    const clients = await db('tenants').select('id', 'username', 'brand_name', 'domain', 'created_at');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// Create client
router.post('/clients', async (req, res) => {
  const { username, password, brand_name, domain } = req.body;
  if (!username || !password || !brand_name || !domain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const existing = await db('tenants').where({ username }).first();
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const password_hash = await bcrypt.hash(password, 10);
    const tenantId = `tenant_${Date.now()}`;
    
    await db('tenants').insert({
      id: tenantId,
      username,
      password_hash,
      brand_name,
      domain,
      shopify_config: '{}',
      meta_config: '{}',
      tracking_config: '{}'
    });
    
    res.json({ success: true, id: tenantId });
  } catch (err) {
    console.error('Error creating client', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update client password
router.put('/clients/:id/password', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  try {
    const password_hash = await bcrypt.hash(password, 10);
    await db('tenants').where({ id }).update({ password_hash });
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating password', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete client
router.delete('/clients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db('tenants').where({ id }).del();
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting client', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- NEW SETTINGS ENDPOINTS ---

const envPath = path.join(__dirname, '../../.env');

// Get masked environment variables
router.get('/env', (req, res) => {
  try {
    if (!fs.existsSync(envPath)) {
      return res.json({});
    }
    const envFile = fs.readFileSync(envPath, 'utf8');
    const keys = {};
    const extract = (key) => {
      const match = envFile.match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (match) {
        const val = match[1].trim();
        // Mask the value for security if it's longer than 6 chars
        if (val.length > 6) {
          keys[key] = val.substring(0, 3) + '...' + val.substring(val.length - 3);
        } else {
          keys[key] = '***'; // Fully masked if too short
        }
      }
    };

    extract('RAZORPAY_KEY_ID');
    extract('RAZORPAY_KEY_SECRET');
    extract('RAZORPAY_PLAN_ID');
    extract('GOOGLE_CLIENT_ID');
    extract('GOOGLE_CLIENT_SECRET');

    res.json(keys);
  } catch (err) {
    console.error('Error reading env:', err);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// Update environment variables and restart
router.post('/env', (req, res) => {
  try {
    const updates = req.body; // e.g. { RAZORPAY_KEY_ID: 'xxx' }
    if (!fs.existsSync(envPath)) {
      return res.status(400).json({ error: '.env file not found on server' });
    }
    
    let envFile = fs.readFileSync(envPath, 'utf8');
    
    // Update each key in the file
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value.includes('...')) continue; // Skip empty or masked updates

      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envFile)) {
        envFile = envFile.replace(regex, `${key}=${value}`);
      } else {
        envFile += `\n${key}=${value}`;
      }
    }
    
    fs.writeFileSync(envPath, envFile, 'utf8');
    
    res.json({ success: true, message: 'Settings saved! Restarting server...' });
    
    // Restart the process after sending response (Docker will bring it back up)
    setTimeout(() => {
      console.log('Admin triggered restart to apply .env changes');
      process.exit(0);
    }, 1000);

  } catch (err) {
    console.error('Error updating env:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

module.exports = router;
