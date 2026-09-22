const fs = require('fs');

const dashboardHtml = fs.readFileSync('public/dashboard/index.html', 'utf8');
const adminHtml = fs.readFileSync('public/admin/index.html', 'utf8');

// Extract the clients table and modal from adminHtml
const clientsContentMatch = adminHtml.match(/<div class="mb-8 flex justify-between items-center">[\s\S]*?<\/div>\s*<\/main>/);
const modalMatch = adminHtml.match(/<!-- Add Client Modal -->[\s\S]*?<\/div>\s*<\/div>/);
const loadClientsScriptMatch = adminHtml.match(/async function loadClients\(\) \{[\s\S]*?<\/script>/);

let newDashboard = dashboardHtml.replace(
    '<!-- Main Content -->',
    `<!-- Admin Clients View (Hidden by Default) -->
    <div id="view-clients" class="hidden flex-1 flex-col h-screen overflow-y-auto bg-slate-50 p-6 md:p-8">
        <div class="max-w-7xl mx-auto space-y-6">
            <div class="mb-8 flex justify-between items-center">
                <div>
                    <h2 class="text-2xl font-bold text-slate-900">Clients</h2>
                    <p class="mt-1 text-sm text-slate-500">Manage SaaS tenants and their dashboard access.</p>
                </div>
                <button id="btn-open-modal" class="bg-brand-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-700 transition-colors">
                    + Register Client
                </button>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table class="min-w-full divide-y divide-slate-200">
                    <thead class="bg-slate-50">
                        <tr>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Brand Name</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tenant ID</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Login Username</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Domain</th>
                            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                        </tr>
                    </thead>
                    <tbody id="clients-list" class="bg-white divide-y divide-slate-200">
                        <!-- Clients will be loaded here -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <!-- Add Client Modal -->
    <div id="add-modal" class="hidden fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Register New Client</h3>
            <form id="add-client-form">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Brand Name</label>
                        <input type="text" id="brand_name" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Store Domain</label>
                        <input type="text" id="domain" placeholder="client.myshopify.com" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Login Username</label>
                        <input type="text" id="username" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Login Password</label>
                        <input type="password" id="password" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500">
                    </div>
                </div>
                <div class="mt-6 flex justify-end gap-3">
                    <button type="button" id="btn-close-modal" class="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">Register</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Main Content -->`
);

// Add IDs to the main content so we can hide it
newDashboard = newDashboard.replace(
    '<div class="flex-1 flex flex-col h-screen overflow-hidden">',
    '<div id="view-analytics" class="flex-1 flex flex-col h-screen overflow-hidden">'
);

// Add the Clients nav item in the sidebar
newDashboard = newDashboard.replace(
    '<div class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Configuration</div>',
    `<div id="nav-admin" class="hidden mb-6">
        <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Master Admin</div>
        <nav class="space-y-1">
            <a href="#" id="link-clients" class="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg font-medium transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                Clients
            </a>
        </nav>
    </div>
    <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">Configuration</div>`
);

// Inject JS for admin features and auth
let adminScript = `
        let evtSource = null;

        // Admin functions
        async function loadClients() {
            try {
                const res = await fetch('/api/admin/clients');
                if (res.status === 401) { window.location.href = '/'; return; }
                if (!res.ok) throw new Error('Failed');
                const clients = await res.json();
                document.getElementById('clients-list').innerHTML = clients.map(c => \`
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">\${c.brand_name}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">\${c.id}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">\${c.username || '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">\${c.domain}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">\${new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                \`).join('');
            } catch(e) { console.error(e); }
        }

        async function addClient(e) {
            e.preventDefault();
            const data = {
                brand_name: document.getElementById('brand_name').value,
                domain: document.getElementById('domain').value,
                username: document.getElementById('username').value,
                password: document.getElementById('password').value
            };
            try {
                const res = await fetch('/api/admin/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    document.getElementById('add-modal').classList.add('hidden');
                    document.getElementById('add-client-form').reset();
                    loadClients();
                } else {
                    const err = await res.json();
                    alert('Error: ' + err.error);
                }
            } catch(err) { alert('Request failed'); }
        }

        // View toggle
        function showClients() {
            document.getElementById('view-analytics').classList.add('hidden');
            document.getElementById('view-analytics').classList.remove('flex');
            document.getElementById('view-clients').classList.remove('hidden');
            document.getElementById('view-clients').classList.add('flex');
            
            // Highlight nav
            document.getElementById('link-clients').classList.add('bg-brand-50', 'text-brand-600');
            document.getElementById('link-clients').classList.remove('text-slate-600', 'hover:bg-slate-50');
            document.querySelector('a[href="/dashboard"]').classList.remove('bg-brand-50', 'text-brand-600');
            document.querySelector('a[href="/dashboard"]').classList.add('text-slate-600', 'hover:bg-slate-50');
            
            if(evtSource) { evtSource.close(); evtSource = null; }
            loadClients();
        }

        function showAnalytics() {
            document.getElementById('view-clients').classList.add('hidden');
            document.getElementById('view-clients').classList.remove('flex');
            document.getElementById('view-analytics').classList.remove('hidden');
            document.getElementById('view-analytics').classList.add('flex');
            
            // Highlight nav
            document.querySelector('a[href="/dashboard"]').classList.add('bg-brand-50', 'text-brand-600');
            document.querySelector('a[href="/dashboard"]').classList.remove('text-slate-600', 'hover:bg-slate-50');
            document.getElementById('link-clients').classList.remove('bg-brand-50', 'text-brand-600');
            document.getElementById('link-clients').classList.add('text-slate-600', 'hover:bg-slate-50');
            
            connectSSE();
        }

        function connectSSE() {
            if(evtSource) return;
            evtSource = new EventSource('/api/dashboard/stream');
            evtSource.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    updateUI(data);
                } catch (err) { console.error('Error parsing SSE data', err); }
            };
            evtSource.onerror = function(err) {
                console.error('EventSource failed:', err);
                if (document.getElementById('tenant-name').textContent !== 'Master Admin') {
                    document.getElementById('tenant-name').textContent = 'Reconnecting...';
                }
            };
        }

        // Auth init
        async function initAuth() {
            try {
                const res = await fetch('/api/me');
                if (res.status === 401) { window.location.href = '/'; return; }
                const user = await res.json();
                
                document.getElementById('user-name-display').innerText = user.role === 'master_admin' ? 'Master Admin' : 'Client';

                if (user.role === 'master_admin') {
                    document.getElementById('nav-admin').classList.remove('hidden');
                    document.getElementById('tenant-name').textContent = 'Master Admin';
                    showClients(); // Master admin sees clients by default
                } else {
                    document.getElementById('tenant-name').textContent = 'Loading...';
                    showAnalytics(); // Client sees analytics
                }
            } catch(e) {
                console.error(e);
            }
        }
`;

// Replace the DOMContentLoaded event listener
newDashboard = newDashboard.replace(
    /document\.addEventListener\('DOMContentLoaded', \(\) => \{[\s\S]*?\}\);/,
    `document.getElementById('btn-open-modal').addEventListener('click', () => { document.getElementById('add-modal').classList.remove('hidden'); });
        document.getElementById('btn-close-modal').addEventListener('click', () => { document.getElementById('add-modal').classList.add('hidden'); });
        document.getElementById('add-client-form').addEventListener('submit', addClient);
        
        document.getElementById('link-clients').addEventListener('click', (e) => { e.preventDefault(); showClients(); });
        document.querySelector('a[href="/dashboard"]').addEventListener('click', (e) => { 
            // If master admin, allow viewing empty analytics? Sure.
            e.preventDefault(); 
            showAnalytics(); 
        });

        document.addEventListener('DOMContentLoaded', initAuth);`
);

// Inject adminScript before updateUI
newDashboard = newDashboard.replace('function updateUI', adminScript + '\n        function updateUI');

// Update Admin User text to dynamic
newDashboard = newDashboard.replace(
    '<p class="text-sm font-medium text-slate-900 truncate">Admin User</p>',
    '<p id="user-name-display" class="text-sm font-medium text-slate-900 truncate">User</p>'
);

fs.writeFileSync('public/dashboard/index.html', newDashboard);
console.log("Merged!");
