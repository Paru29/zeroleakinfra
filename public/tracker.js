/**
 * ZeroLeak Tracker Pixel
 * Clients install this snippet on their Shopify Store.
 */
(function() {
    // Prevent double-loading
    if (window.ZeroLeakTracked) return;
    window.ZeroLeakTracked = true;

    // We explicitly set the tracking API host to our main domain
    let apiHost = 'https://track.zeroleakinfra.tech';
    
    // Attempt to read the explicitly provided tenant ID from the script tag
    const scriptTag = document.getElementById('zeroleak-tracker');
    const explicitTenant = scriptTag ? scriptTag.getAttribute('data-tenant') : null;

    const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const getQueryParams = () => {
        const params = new URLSearchParams(window.location.search);
        return {
            utm_source: params.get('utm_source'),
            utm_medium: params.get('utm_medium'),
            utm_campaign: params.get('utm_campaign'),
            utm_content: params.get('utm_content'),
            utm_term: params.get('utm_term'),
            fbclid: params.get('fbclid'),
            gclid: params.get('gclid')
        };
    };

    const persistAttribution = (params) => {
        const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
        let hasNewParams = false;
        
        keys.forEach(key => {
            if (params[key]) {
                localStorage.setItem(`zl_${key}`, params[key]);
                sessionStorage.setItem(`zl_${key}`, params[key]);
                hasNewParams = true;
            }
        });

        if (!sessionStorage.getItem('zl_landing_page')) {
            sessionStorage.setItem('zl_landing_page', window.location.href);
            sessionStorage.setItem('zl_referrer', document.referrer);
            hasNewParams = true;
        }
        
        return hasNewParams;
    };

    const getPersistedAttribution = () => {
        const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'landing_page', 'referrer'];
        const data = {};
        keys.forEach(key => {
            data[key] = sessionStorage.getItem(`zl_${key}`) || localStorage.getItem(`zl_${key}`);
        });
        return data;
    };

    const sendEvent = async (eventName, eventData = {}) => {
        const eventId = generateUUID();
        const attribution = getPersistedAttribution();
        
        const payload = {
            event_id: eventId,
            event_name: eventName,
            page: window.location.href,
            timestamp: Math.floor(Date.now() / 1000),
            attribution,
            ...eventData
        };

        try {
            await fetch(`${apiHost}/api/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // The backend resolves the tenant using this header.
                    // Priority 1: Explicit tenant ID from the snippet (data-tenant)
                    // Priority 2: The client's hostname
                    'X-Tenant-Domain': explicitTenant || window.location.hostname 
                },
                body: JSON.stringify(payload),
                keepalive: true
            });
            console.log(`[ZeroLeak] Sent ${eventName}`);
            
            // If it's an AddToCart event, we need to save the event_id into Shopify's cart attributes
            // so that it survives through checkout and reaches the Webhook.
            if (eventName === 'AddToCart') {
                updateShopifyCartAttributes(eventId, attribution);
            }
            
            return eventId;
        } catch (e) {
            console.error(`[ZeroLeak] Failed to send ${eventName}`, e);
        }
    };

    // Helper to push attribution data into Shopify's Cart Attributes
    const updateShopifyCartAttributes = async (eventId, attribution) => {
        const attributes = {
            'zl_event_id': eventId
        };
        
        if (attribution.fbclid) attributes['fbclid'] = attribution.fbclid;
        if (attribution.utm_source) attributes['utm_source'] = attribution.utm_source;
        if (attribution.utm_medium) attributes['utm_medium'] = attribution.utm_medium;
        if (attribution.utm_campaign) attributes['utm_campaign'] = attribution.utm_campaign;

        try {
            await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attributes })
            });
            console.log('[ZeroLeak] Shopify cart attributes updated');
        } catch (err) {
            console.warn('[ZeroLeak] Failed to update Shopify cart attributes', err);
        }
    };

    // Initialize Tracker
    const init = () => {
        const params = getQueryParams();
        persistAttribution(params);

        // 1. Track Page View
        sendEvent('ViewContent');

        // 2. Intercept Shopify AddToCart clicks (Basic Example)
        // In a real Shopify store, they might use AJAX carts. We intercept form submits to /cart/add
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form && form.action && form.action.includes('/cart/add')) {
                // Grab product info from the form if possible
                const formData = new FormData(form);
                const variantId = formData.get('id');
                sendEvent('AddToCart', { variant_id: variantId });
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
