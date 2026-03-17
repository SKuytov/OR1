// ===================== PATCH FOR REQUESTER UI =====================
// This is a patch to hide the "Create Quote from Selected" button for requesters
// Add this code to your showDashboard() function in app.js

// Inside showDashboard() function, add this after setting up the user role badge:

function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboardScreen.classList.remove('hidden');
    userName.textContent = currentUser.name;
    userRoleBadge.textContent = currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'procurement' ? 'Procurement' : `Requester · ${currentUser.building}`;

    if (usersTabButton) usersTabButton.hidden = true;
    if (buildingsTabButton) buildingsTabButton.hidden = true;
    if (costCentersTabButton) costCentersTabButton.hidden = true;

    if (currentUser.role === 'requester') {
        createOrderSection.classList.remove('hidden');
        requesterBuildingBadge.textContent = `Building ${currentUser.building}`;
        navTabs.classList.add('hidden');
        
        // HIDE ORDER ACTIONS CONTAINER FOR REQUESTERS
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'none';
        }
    } else {
        createOrderSection.classList.add('hidden');
        navTabs.classList.remove('hidden');
        populateStatusFilter();
        
        // SHOW ORDER ACTIONS CONTAINER FOR ADMIN/PROCUREMENT
        const orderActionsContainer = document.getElementById('orderActionsContainer');
        if (orderActionsContainer) {
            orderActionsContainer.style.display = 'flex';
        }

        if (currentUser.role === 'admin') {
            if (usersTabButton) usersTabButton.hidden = false;
            if (buildingsTabButton) buildingsTabButton.hidden = false;
            if (costCentersTabButton) costCentersTabButton.hidden = false;
        }
    }

    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const ordersTabEl = document.getElementById('ordersTab');
    if (ordersTabEl) ordersTabEl.classList.remove('hidden');
    currentTab = 'ordersTab';

    loadBuildings();
    loadCostCenters();
    loadSuppliers().then(() => { populateSupplierFilter(); });
    loadOrders();
    if (currentUser.role !== 'requester') { loadQuotes(); }
    if (currentUser.role === 'admin') { loadUsers(); }
}

// ===================== INSTRUCTIONS =====================
// 1. Open frontend/app.js
// 2. Find the showDashboard() function (around line 525)
// 3. Replace the entire function with the one above
// 4. Save the file
// 5. Refresh your browser
