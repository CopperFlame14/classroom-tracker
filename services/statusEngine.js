const { initDB, prepare } = require('../database/db');

let dbInitialized = false;

/**
 * Ensure database is initialized
 */
async function ensureDB() {
    if (!dbInitialized) {
        await initDB();
        dbInitialized = true;
    }
}

/**
 * Helper to get date object in school's timezone (Asia/Kolkata)
 */
function getSchoolTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

/**
 * Get the current time slot based on current time
 */
function getCurrentTimeSlot() {
    const now = getSchoolTime();
    // Get HH:MM in 24-hour format
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    const slots = prepare('SELECT * FROM time_slots ORDER BY id').all();
    for (const slot of slots) {
        if (currentTime >= slot.start_time && currentTime < slot.end_time) {
            return slot;
        }
    }

    return null;
}

/**
 * Get today's day name
 */
function getTodayName() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[getSchoolTime().getDay()];
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
    const now = getSchoolTime();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Calculate room status based on timetable, reservations, and overrides
 * Priority: Override > Reservation > Timetable > Available
 */
function getRoomStatus(roomId, slotId = null, day = null, date = null) {
    const currentSlot = (slotId !== null && slotId !== undefined) ? parseInt(slotId) : (getCurrentTimeSlot()?.id || null);
    const currentDay = day || getTodayName();
    const currentDate = date || getTodayDate();

    if (!currentSlot) {
        return { status: 'available', reason: 'Outside class hours' };
    }

    // Check for manual override
    const room = prepare('SELECT * FROM classrooms WHERE id = ?').get(roomId);
    if (room && room.status_override) {
        // Check if override has expired
        if (room.override_expires) {
            const expiry = new Date(room.override_expires);
            if (expiry > new Date()) {
                return { status: room.status_override, reason: 'Manual override' };
            } else {
                // Clear expired override
                prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(roomId);
            }
        } else {
            return { status: room.status_override, reason: 'Manual override' };
        }
    }

    // Check for reservation - ensure slot_id is integer for comparison
    const reservations = prepare(`
        SELECT * FROM reservations 
        WHERE room_id = ? AND CAST(slot_id AS INTEGER) = ? AND date = ?
    `).all(roomId, currentSlot, currentDate);

    if (reservations.length > 0) {
        const reservation = reservations[0];
        return {
            status: 'reserved',
            reason: reservation.purpose || 'Reserved',
            bookedBy: reservation.booked_by
        };
    }

    // Check timetable - ensure slot_id is integer for comparison
    const timetableEntries = prepare(`
        SELECT * FROM timetable 
        WHERE room_id = ? AND CAST(slot_id AS INTEGER) = ? AND day = ?
    `).all(roomId, currentSlot, currentDay);

    if (timetableEntries.length > 0) {
        const entry = timetableEntries[0];
        return {
            status: 'occupied',
            reason: entry.subject,
            faculty: entry.faculty
        };
    }

    return { status: 'available', reason: 'No scheduled classes' };
}

/**
 * Get all rooms with their current status
 */
function getAllRoomsWithStatus(slotId = null, date = null) {
    const rooms = prepare('SELECT * FROM classrooms ORDER BY block, floor, id').all();

    let targetSlotId = null;
    let targetDay = null;
    let targetDate = null;

    if (slotId || date) {
        targetDate = date || getTodayDate();
        targetSlotId = slotId ? parseInt(slotId) : null;

        // Calculate day from date
        const d = new Date(targetDate);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        targetDay = dayNames[d.getDay()];
    } else {
        const currentSlot = getCurrentTimeSlot();
        targetSlotId = currentSlot?.id || null;
        targetDay = getTodayName();
        targetDate = getTodayDate();
    }

    return rooms.map(room => {
        const statusInfo = getRoomStatus(room.id, targetSlotId, targetDay, targetDate);
        return {
            ...room,
            amenities: room.amenities ? JSON.parse(room.amenities) : [],
            currentStatus: statusInfo.status,
            statusReason: statusInfo.reason,
            statusDetails: statusInfo
        };
    });
}

/**
 * Get available slots for a specific room and date
 */
function getAvailableSlotsForRoom(roomId, date) {
    const slots = prepare('SELECT * FROM time_slots ORDER BY id').all();
    const d = new Date(date);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[d.getDay()];

    return slots.map(slot => {
        const status = getRoomStatus(roomId, slot.id, day, date);
        return {
            ...slot,
            isAvailable: status.status === 'available',
            statusDetails: status
        };
    });
}

/**
 * Check for booking conflicts
 */
function checkConflict(roomId, slotId, date) {
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()];

    // Check timetable
    const timetableConflicts = prepare(`
        SELECT * FROM timetable 
        WHERE room_id = ? AND slot_id = ? AND day = ?
    `).all(roomId, slotId, day);

    if (timetableConflicts.length > 0) {
        const conflict = timetableConflicts[0];
        return {
            hasConflict: true,
            type: 'timetable',
            details: `Regular class: ${conflict.subject} by ${conflict.faculty}`
        };
    }

    // Check existing reservations
    const reservationConflicts = prepare(`
        SELECT * FROM reservations 
        WHERE room_id = ? AND slot_id = ? AND date = ?
    `).all(roomId, slotId, date);

    if (reservationConflicts.length > 0) {
        const conflict = reservationConflicts[0];
        return {
            hasConflict: true,
            type: 'reservation',
            details: `Already reserved: ${conflict.purpose} by ${conflict.booked_by}`
        };
    }

    return { hasConflict: false };
}

/**
 * Clear expired status overrides
 */
function clearExpiredOverrides() {
    const now = new Date().toISOString();
    const rooms = prepare(`
        SELECT id FROM classrooms 
        WHERE override_expires IS NOT NULL AND override_expires < ?
    `).all(now);

    rooms.forEach(room => {
        prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(room.id);
    });

    return rooms.length;
}

module.exports = {
    ensureDB,
    getCurrentTimeSlot,
    getTodayName,
    getTodayDate,
    getRoomStatus,
    getAllRoomsWithStatus,
    checkConflict,
    clearExpiredOverrides,
    getAvailableSlotsForRoom
};
