const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../db');
const router = express.Router();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

// Create subscription link
router.post('/subscribe', async (req, res) => {
    try {
        const tenantId = req.session.tenant_id;
        if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

        const plan_id = req.body.plan_id || process.env.RAZORPAY_PLAN_ID;
        if (!plan_id) return res.status(400).json({ error: 'plan_id is required. Set it in Admin Settings.' });

        const tenant = await db('tenants').where('id', tenantId).first();

        // Optional: Create customer in Razorpay if not exists
        let customerId = tenant.razorpay_customer_id;
        /*
        if (!customerId) {
            const customer = await razorpay.customers.create({
                name: tenant.brand_name,
                email: tenant.username,
                contact: tenant.mobile_no || undefined
            });
            customerId = customer.id;
            await db('tenants').where('id', tenantId).update({ razorpay_customer_id: customerId });
        }
        */

        const subscription = await razorpay.subscriptions.create({
            plan_id: plan_id,
            customer_notify: 1,
            total_count: 120 // 10 years if monthly
        });

        await db('tenants').where('id', tenantId).update({
            razorpay_subscription_id: subscription.id,
            subscription_plan: plan_id,
            subscription_status: 'created'
        });

        res.json({
            subscription_id: subscription.id,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error('Razorpay Error:', error);
        res.status(500).json({ error: 'Error creating subscription' });
    }
});

// Verify Payment
router.post('/verify', async (req, res) => {
    try {
        const tenantId = req.session.tenant_id;
        const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

        const body = razorpay_payment_id + "|" + razorpay_subscription_id;

        const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'dummy_secret')
                                        .update(body.toString())
                                        .digest('hex');

        if (expectedSignature === razorpay_signature) {
            await db('tenants').where('id', tenantId).update({
                subscription_status: 'active'
            });
            res.json({ success: true, message: "Payment successful and verified" });
        } else {
            res.status(400).json({ success: false, message: "Invalid signature" });
        }
    } catch (err) {
        console.error('Verify error', err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Get Subscription Status
router.get('/status', async (req, res) => {
    try {
        const tenantId = req.session.tenant_id;
        const tenant = await db('tenants').where('id', tenantId).first();
        res.json({
            status: tenant.subscription_status,
            plan: tenant.subscription_plan,
            subscription_id: tenant.razorpay_subscription_id
        });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching status' });
    }
});

module.exports = router;
