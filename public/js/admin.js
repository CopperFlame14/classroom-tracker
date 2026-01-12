// ===========================
// CLASSROOM TRACKER - ADMIN
// ===========================

const API_BASE = '/api';

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        window.location.href = '/login';
        return;
    }

    updateClock();
    setInterval(updateClock, 1000);
    loadRoomsDropdown();
    loadTimeSlots();
    loadReservations();
    setDefaultDate();
    setupForm();
    updateUserIndicator();
});

// ===========================
// AUTHENTICATION
// ===========================

function getAuthToken() {
    return localStorage.getItem('authToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

async function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Auth check failed:', error);
        return false;
    }
}

function updateUserIndicator() {
    const username = localStorage.getItem('authUser') || 'Admin';
    const indicator = document.getElementById('userIndicator');
    if (indicator) {
        indicator.textContent = `👤 ${username}`;
    }
}

async function logout() {
    const token = getAuthToken();

    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.href = '/login';
}

// ===========================
// CLOCK
// ===========================

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;

    fetch(`${API_BASE}/timeslots/current`)
        .then(res => res.json())
        .then(data => {
            const slotEl = document.getElementById('currentSlot');
            if (data.currentSlot) {
                slotEl.innerHTML = `<span>📚 ${data.currentSlot.label}</span>`;
            } else {
                slotEl.innerHTML = `<span>🌙 Outside class hours</span>`;
            }
        })
        .catch(console.error);
}

// ===========================
// LOAD DATA
// ===========================

async function loadRoomsDropdown() {
    try {
        const response = await fetch(`${API_BASE}/classrooms`);
        const data = await response.json();

        const options = data.rooms.map(room =>
            `<option value="${room.id}">${room.id} (Block ${room.block}, ${room.capacity} seats)</option>`
        ).join('');

        document.getElementById('resRoom').innerHTML = `<option value="">Select a room...</option>${options}`;
        document.getElementById('overrideRoom').innerHTML = `<option value="">Select a room...</option>${options}`;
    } catch (error) {
        console.error('Failed to load rooms:', error);
    }
}

async function loadTimeSlots() {
    try {
        const response = await fetch(`${API_BASE}/timeslots`);
        const slots = await response.json();

        const options = slots.map(slot =>
            `<option value="${slot.id}">${slot.label} (${slot.start_time} - ${slot.end_time})</option>`
        ).join('');

        document.getElementById('resSlot').innerHTML = `<option value="">Select a slot...</option>${options}`;
    } catch (error) {
        console.error('Failed to load time slots:', error);
    }
}

async function loadReservations() {
    try {
        const response = await fetch(`${API_BASE}/reservations?upcoming=true`);
        const reservations = await response.json();

        if (reservations.length === 0) {
            document.getElementById('reservationsTable').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>No upcoming reservations</p>
                </div>
            `;
            return;
        }

        document.getElementById('reservationsTable').innerHTML = `
            <table class="reservations-table">
                <thead>
                    <tr>
                        <th>Room</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Purpose</th>
                        <th>Booked By</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${reservations.map(res => `
                        <tr>
                            <td><strong>${res.room_id}</strong></td>
                            <td>${formatDate(res.date)}</td>
                            <td>${res.start_time} - ${res.end_time}</td>
                            <td>${res.purpose}</td>
                            <td>${res.booked_by}</td>
                            <td>
                                <button class="btn btn-secondary btn-sm" onclick="cancelReservation(${res.id})">
                                    ❌ Cancel
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Failed to load reservations:', error);
    }
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('resDate').value = today;
    document.getElementById('resDate').min = today;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ===========================
// RESERVATION FORM
// ===========================

function setupForm() {
    document.getElementById('reservationForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideConflictAlert();

        const data = {
            room_id: document.getElementById('resRoom').value,
            slot_id: parseInt(document.getElementById('resSlot').value),
            date: document.getElementById('resDate').value,
            purpose: document.getElementById('resPurpose').value,
            booked_by: document.getElementById('resBookedBy').value
        };

        try {
            const response = await fetch(`${API_BASE}/reservations`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                if (response.status === 401) {
                    showToast('Session expired. Please login again.', 'error');
                    setTimeout(() => window.location.href = '/login', 1500);
                    return;
                }
                if (response.status === 409) {
                    showConflictAlert(result.details);
                } else {
                    showToast(result.error || 'Failed to create reservation', 'error');
                }
                return;
            }

            showToast('Reservation created successfully!', 'success');
            document.getElementById('reservationForm').reset();
            setDefaultDate();
            loadReservations();
        } catch (error) {
            console.error('Failed to create reservation:', error);
            showToast('Failed to create reservation', 'error');
        }
    });
}

function showConflictAlert(message) {
    document.getElementById('conflictMessage').textContent = message;
    document.getElementById('conflictAlert').classList.remove('hidden');
}

function hideConflictAlert() {
    document.getElementById('conflictAlert').classList.add('hidden');
}

// ===========================
// STATUS OVERRIDE
// ===========================

async function applyOverride() {
    const roomId = document.getElementById('overrideRoom').value;
    const status = document.getElementById('overrideStatus').value;
    const duration = parseInt(document.getElementById('overrideDuration').value);

    if (!roomId) {
        showToast('Please select a room', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/classrooms/${roomId}/status`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status, expiresIn: duration })
        });

        if (response.status === 401) {
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '/login', 1500);
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to apply override');
        }

        showToast(`Status override applied to ${roomId}`, 'success');
    } catch (error) {
        console.error('Failed to apply override:', error);
        showToast('Failed to apply override', 'error');
    }
}

async function clearOverride() {
    const roomId = document.getElementById('overrideRoom').value;

    if (!roomId) {
        showToast('Please select a room', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/classrooms/${roomId}/status`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (response.status === 401) {
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '/login', 1500);
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to clear override');
        }

        showToast(`Override cleared for ${roomId}`, 'success');
    } catch (error) {
        console.error('Failed to clear override:', error);
        showToast('Failed to clear override', 'error');
    }
}

// ===========================
// CANCEL RESERVATION
// ===========================

async function cancelReservation(id) {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reservations/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (response.status === 401) {
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '/login', 1500);
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to cancel reservation');
        }

        showToast('Reservation cancelled', 'success');
        loadReservations();
    } catch (error) {
        console.error('Failed to cancel reservation:', error);
        showToast('Failed to cancel reservation', 'error');
    }
}

// ===========================
// TOAST
// ===========================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
