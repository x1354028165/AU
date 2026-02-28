// ==================== Constants ====================
var ALL_STATIONS = [
    'Hornsdale Power Reserve', 'Victorian Big Battery', 'Wandoan BESS',
    'Torrens Island BESS', 'Broken Hill Solar Farm', 'Darlington Point',
    'Capital Battery', 'Kwinana BESS', 'Ballarat Terminal Station',
    'Lake Bonney', 'Gannawarra Energy Storage', 'Lincoln Gap Wind Farm',
    'Bulgana Green Power Hub', 'Kennedy Energy Park', 'Collie Battery',
    'Waratah Super Battery'
];

// ==================== Data Layer (localStorage) ====================
function loadOperators() {
    var stored = localStorage.getItem('operators_list');
    if (stored) {
        try { return JSON.parse(stored); } catch(e) {}
    }
    var defaults = [
        { id: 1, name: 'Alpha Energy Services', contact: 'James Wilson', email: 'james@alphaenergy.com.au', stations: ['Hornsdale Power Reserve', 'Victorian Big Battery'], lease_expiry: '2027-06-30', status: 'active', created_at: '2025-03-15' },
        { id: 2, name: 'Pacific Grid Solutions', contact: 'Sarah Chen', email: 'sarah@pacificgrid.com.au', stations: ['Wandoan BESS', 'Torrens Island BESS', 'Broken Hill Solar Farm'], lease_expiry: '2026-12-31', status: 'active', created_at: '2025-05-20' },
        { id: 3, name: 'Southern Power Management', contact: 'Michael Brown', email: 'mbrown@southernpm.com.au', stations: ['Capital Battery'], lease_expiry: '2026-09-15', status: 'active', created_at: '2025-07-01' },
        { id: 4, name: 'Outback BESS Operations', contact: 'David Lee', email: 'david@outbackbess.com.au', stations: ['Kwinana BESS', 'Collie Battery'], lease_expiry: '2025-12-31', status: 'inactive', created_at: '2024-11-10' },
        { id: 5, name: 'Green Dispatch Co', contact: 'Emma Zhang', email: 'emma@greendispatch.com.au', stations: ['Lake Bonney', 'Lincoln Gap Wind Farm', 'Gannawarra Energy Storage'], lease_expiry: '2028-03-31', status: 'active', created_at: '2025-09-05' }
    ];
    localStorage.setItem('operators_list', JSON.stringify(defaults));
    return defaults;
}

function saveOperators(list) {
    localStorage.setItem('operators_list', JSON.stringify(list));
}

function getAssignedStations(excludeOperatorId) {
    var ops = loadOperators();
    var assigned = new Set();
    ops.forEach(function(op) {
        if (op.id !== excludeOperatorId && op.stations) {
            op.stations.forEach(function(s) { assigned.add(s); });
        }
    });
    return assigned;
}

// ==================== Global State ====================
var allUsers = loadOperators();
var filteredUsers = allUsers.slice();
var currentPage = 1;
var pageSize = 20;
var isEditMode = false;
var currentUserId = null;
var deleteUserId = null;
var toastCounter = 0;

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', function() {
    new HeaderNav({
        currentPage: 'organization',
        showMessageCenter: true,
        showUserAvatar: true,
        showLanguageSelector: true
    });

    window.organizationPagination = new Pagination({
        containerId: 'organizationPaginationContainer',
        totalItems: filteredUsers.length,
        itemsPerPage: pageSize,
        currentPage: currentPage,
        onPageChange: function(page) {
            currentPage = page;
            updateTableDisplay();
        }
    });

    setupRealTimeSearch();
    updateTableDisplay();

    if (window.i18n) {
        window.i18n.addObserver(function() {
            updateTableDisplay();
            updateAllTexts();
        });
    }
});

// ==================== Search ====================
function setupRealTimeSearch() {
    var inputs = document.querySelectorAll('.search-input');
    var select = document.getElementById('orgStatusFilter');
    inputs.forEach(function(input) {
        var t;
        input.addEventListener('input', function() { clearTimeout(t); t = setTimeout(searchUsers, 300); });
    });
    select.addEventListener('change', searchUsers);
}

function searchUsers() {
    var name = document.getElementById('orgSearchInput').value.trim().toLowerCase();
    var email = document.getElementById('orgEmailInput').value.trim().toLowerCase();
    var status = document.getElementById('orgStatusFilter').value;

    allUsers = loadOperators();
    filteredUsers = allUsers.filter(function(u) {
        if (name && u.name.toLowerCase().indexOf(name) === -1) return false;
        if (email && u.email.toLowerCase().indexOf(email) === -1) return false;
        if (status && u.status !== status) return false;
        return true;
    });

    currentPage = 1;
    if (window.organizationPagination) {
        window.organizationPagination.updateTotalItems(filteredUsers.length);
        window.organizationPagination.setCurrentPage(1);
    }
    updateTableDisplay();
}

function resetSearch() {
    document.getElementById('orgSearchInput').value = '';
    document.getElementById('orgEmailInput').value = '';
    document.getElementById('orgStatusFilter').value = '';
    allUsers = loadOperators();
    filteredUsers = allUsers.slice();
    currentPage = 1;
    if (window.organizationPagination) {
        window.organizationPagination.updateTotalItems(filteredUsers.length);
        window.organizationPagination.setCurrentPage(1);
    }
    updateTableDisplay();
    showInfoToast('Reset', 'Filters cleared');
}

// ==================== Table Render ====================
function updateTableDisplay() {
    var tbody = document.getElementById('userTableBody');
    var start = (currentPage - 1) * pageSize;
    var end = Math.min(start + pageSize, filteredUsers.length);
    var display = filteredUsers.slice(start, end);
    var now = new Date();

    if (display.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--color-text-secondary);">No data</td></tr>';
        return;
    }

    function t(key, fallback) { return window.i18n ? window.i18n.getText(key) : fallback; }

    tbody.innerHTML = display.map(function(user) {
        var isExpired = new Date(user.lease_expiry) < now;
        var statusLabel;
        if (isExpired) {
            statusLabel = '<span class="status-badge" style="background:rgba(255,59,48,0.1);color:#ff4444;"><span class="status-indicator"></span>' + t('mgmt_status_expired', 'Expired') + '</span>';
        } else if (user.status === 'active') {
            statusLabel = '<span class="status-badge active"><span class="status-indicator"></span>' + t('mgmt_status_active', 'Active') + '</span>';
        } else {
            statusLabel = '<span class="status-badge inactive"><span class="status-indicator"></span>' + t('organization.status.inactive', 'Inactive') + '</span>';
        }

        var leaseStyle = isExpired ? 'color:#ff4444;font-weight:600;' : '';
        var rowStyle = isExpired ? ' style="background:rgba(255,59,48,0.03);"' : '';
        var stationList = (user.stations || []).join(', ') || '-';
        var stationCount = (user.stations || []).length;
        var editText = t('operatorMgmt.actions.edit', 'Edit');
        var deleteText = t('operatorMgmt.actions.delete', 'Delete');
        var expiredIcon = isExpired ? ' ⚠️' : '';

        return '<tr' + rowStyle + '>' +
            '<td><strong>' + user.name + '</strong><br><span style="color:rgba(255,255,255,0.5);font-size:12px;">' + user.email + '</span></td>' +
            '<td>' + (user.contact || '-') + '</td>' +
            '<td style="max-width:200px;"><span style="font-size:12px;color:rgba(255,255,255,0.7);">' + stationList + '</span></td>' +
            '<td style="text-align:center;">' + stationCount + '</td>' +
            '<td style="' + leaseStyle + '">' + user.lease_expiry + expiredIcon + '</td>' +
            '<td>' + statusLabel + '</td>' +
            '<td><div class="action-buttons">' +
                '<button class="action-btn edit" onclick="editUser(' + user.id + ')">' + editText + '</button>' +
                '<button class="action-btn delete" onclick="deleteUser(' + user.id + ')">' + deleteText + '</button>' +
            '</div></td>' +
        '</tr>';
    }).join('');
}

// ==================== Station Checkbox List ====================
function renderStationCheckboxes(selectedStations, editingOperatorId) {
    var container = document.getElementById('stationCheckboxList');
    var assigned = getAssignedStations(editingOperatorId);
    var selected = new Set(selectedStations || []);

    container.innerHTML = ALL_STATIONS.map(function(name) {
        var isAssignedElsewhere = assigned.has(name) && !selected.has(name);
        var checked = selected.has(name) ? ' checked' : '';
        var disabled = isAssignedElsewhere ? ' disabled' : '';
        var labelStyle = isAssignedElsewhere ? 'color:rgba(255,255,255,0.3);' : 'color:rgba(255,255,255,0.9);';
        var cursor = isAssignedElsewhere ? 'not-allowed' : 'pointer';
        var hint = isAssignedElsewhere ? ' <span style="font-size:11px;color:rgba(255,149,0,0.8);">(assigned)</span>' : '';
        return '<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:' + cursor + ';' + labelStyle + '">' +
            '<input type="checkbox" class="station-checkbox" value="' + name + '"' + checked + disabled + ' style="width:16px;height:16px;">' +
            '<span>' + name + hint + '</span>' +
        '</label>';
    }).join('');
}

function getSelectedStations() {
    return Array.from(document.querySelectorAll('.station-checkbox:checked')).map(function(cb) { return cb.value; });
}

// ==================== Modal ====================
function addOrganization() {
    isEditMode = false;
    currentUserId = null;
    document.getElementById('modalTitle').textContent = window.i18n ? window.i18n.getText('mgmt_btn_add') : 'Add Operator';
    clearForm();
    document.getElementById('passwordGroup').style.display = 'block';
    var twoYearsLater = new Date();
    twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);
    document.getElementById('userLeaseExpiry').value = twoYearsLater.toISOString().slice(0, 10);
    renderStationCheckboxes([], null);
    openModal();
}

function editUser(userId) {
    isEditMode = true;
    currentUserId = userId;
    document.getElementById('modalTitle').textContent = window.i18n ? window.i18n.getText('operatorMgmt.modal.editOperator') : 'Edit Operator';

    var user = allUsers.find(function(u) { return u.id === userId; });
    if (!user) return;

    document.getElementById('userName').value = user.name;
    document.getElementById('userContact').value = user.contact || '';
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userLeaseExpiry').value = user.lease_expiry || '';
    document.getElementById('userRemark').value = user.remark || '';
    var statusId = 'status' + user.status.charAt(0).toUpperCase() + user.status.slice(1);
    document.getElementById(statusId).checked = true;
    document.getElementById('passwordGroup').style.display = 'none';

    renderStationCheckboxes(user.stations || [], userId);
    openModal();
}

function deleteUser(userId) {
    deleteUserId = userId;
    var user = allUsers.find(function(u) { return u.id === userId; });
    if (user) {
        document.getElementById('confirmUserName').textContent = user.name;
        document.getElementById('confirmUserEmail').textContent = user.email;
    }
    document.getElementById('confirmDeleteModal').classList.add('active');
}

function confirmDeleteUser() {
    if (!deleteUserId) return;
    var ops = loadOperators();
    ops = ops.filter(function(u) { return u.id !== deleteUserId; });
    saveOperators(ops);

    allUsers = ops;
    filteredUsers = filteredUsers.filter(function(u) { return u.id !== deleteUserId; });

    if (window.organizationPagination) {
        window.organizationPagination.updateTotalItems(filteredUsers.length);
    }
    updateTableDisplay();
    showSuccessToast('Deleted', 'Operator removed, stations unassigned');
    closeConfirmModal();
}

function openModal() {
    document.getElementById('userModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    var modal = document.getElementById('userModal');
    modal.classList.remove('active');
    setTimeout(function() { document.body.style.overflow = 'auto'; clearForm(); }, 300);
}

function handleModalClick(e) { if (e.target.id === 'userModal') closeModal(); }
function closeConfirmModal() { document.getElementById('confirmDeleteModal').classList.remove('active'); deleteUserId = null; }
function handleConfirmModalClick(e) { if (e.target.id === 'confirmDeleteModal') closeConfirmModal(); }
function clearForm() { document.getElementById('userForm').reset(); document.getElementById('statusActive').checked = true; }

function saveUser() {
    var name = document.getElementById('userName').value.trim();
    var contact = document.getElementById('userContact').value.trim();
    var email = document.getElementById('userEmail').value.trim();
    var password = document.getElementById('userPassword').value.trim();
    var leaseExpiry = document.getElementById('userLeaseExpiry').value;
    var remark = document.getElementById('userRemark').value.trim();
    var status = document.querySelector('input[name="status"]:checked').value;
    var stations = getSelectedStations();

    if (!name || !email || (!isEditMode && !password) || !leaseExpiry) {
        showErrorToast('Validation', 'Please fill all required fields');
        return;
    }

    var ops = loadOperators();
    if (isEditMode) {
        var idx = ops.findIndex(function(u) { return u.id === currentUserId; });
        if (idx !== -1) {
            ops[idx].name = name;
            ops[idx].contact = contact;
            ops[idx].email = email;
            ops[idx].stations = stations;
            ops[idx].lease_expiry = leaseExpiry;
            ops[idx].status = status;
            ops[idx].remark = remark;
        }
    } else {
        var maxId = ops.reduce(function(m, o) { return Math.max(m, o.id); }, 0);
        ops.unshift({
            id: maxId + 1, name: name, contact: contact, email: email,
            login_account: email, password: password, stations: stations,
            lease_expiry: leaseExpiry, status: status, remark: remark,
            created_at: new Date().toISOString().slice(0, 10)
        });
    }

    saveOperators(ops);
    allUsers = ops;
    filteredUsers = allUsers.slice();
    currentPage = 1;
    if (window.organizationPagination) {
        window.organizationPagination.updateTotalItems(filteredUsers.length);
        window.organizationPagination.setCurrentPage(1);
    }
    updateTableDisplay();
    closeModal();
    showSuccessToast('Saved', isEditMode ? 'Operator updated' : 'Operator created');
}

function togglePassword() {
    var p = document.getElementById('userPassword');
    var b = document.querySelector('.password-toggle');
    if (p.type === 'password') { p.type = 'text'; b.textContent = '🙈'; }
    else { p.type = 'password'; b.textContent = '👁'; }
}

function updateAllTexts() {
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-placeholder');
        if (window.i18n) el.placeholder = window.i18n.getText(key);
    });
}

// ==================== Export / Refresh ====================
function exportOrganizationData() {
    showToast('info', 'Exporting', 'Preparing CSV...');
    setTimeout(function() {
        var ops = loadOperators();
        var rows = ops.map(function(o) {
            return '"' + o.name + '","' + o.contact + '","' + o.email + '","' + (o.stations || []).join('; ') + '",' + o.lease_expiry + ',' + o.status;
        });
        var csv = 'Name,Contact,Email,Stations,Lease Expiry,Status\n' + rows.join('\n');
        var blob = new Blob([csv], {type: 'text/csv'});
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'operators_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        showSuccessToast('Exported', 'CSV downloaded');
    }, 500);
}

function refreshOrganizationData() {
    allUsers = loadOperators();
    filteredUsers = allUsers.slice();
    updateTableDisplay();
    showSuccessToast('Refreshed', 'Data reloaded');
}

// ==================== Toasts ====================
function showToast(type, title, message, duration) {
    duration = duration || 3000;
    var container = document.getElementById('toastContainer');
    var id = 'toast-' + (++toastCounter);
    var icons = { success: '✓', error: '✕', warning: '⚠', info: 'i' };
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.id = id;
    toast.innerHTML =
        '<div class="toast-icon">' + (icons[type] || 'i') + '</div>' +
        '<div class="toast-content"><div class="toast-title">' + title + '</div><div class="toast-message">' + message + '</div></div>' +
        '<button class="toast-close" onclick="hideToast(\'' + id + '\')">&times;</button>';
    container.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() { hideToast(id); }, duration);
}

function hideToast(id) {
    var t = document.getElementById(id);
    if (t) { t.classList.add('hide'); setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }
}

function showSuccessToast(a, b) { showToast('success', a, b); }
function showErrorToast(a, b) { showToast('error', a, b); }
function showInfoToast(a, b) { showToast('info', a, b); }
