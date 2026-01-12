const express = require('express');
const router = express.Router();
const { initDB, prepare } = require('../database/db');
const { getRoomStatus, getAllRoomsWithStatus, getCurrentTimeSlot, getTodayName, getTodayDate, getAvailableSlotsForRoom } = require('../services/statusEngine');
const { requireAuth } = require('./auth');

// GET /api/classrooms - List all classrooms with status (filterable)
router.get('/', async (req, res) => {
    try {
        await initDB();
        const { block, floor, capacity, status, search, slot_id, date } = req.query;

        // Pass filtering params to getAllRoomsWithStatus
        let rooms = getAllRoomsWithStatus(slot_id, date);

        // Apply filters
        if (block) {
            rooms = rooms.filter(r => r.block === block);
        }
        if (floor !== undefined && floor !== '') {
            rooms = rooms.filter(r => r.floor === parseInt(floor));
        }
        if (capacity) {
            const cap = parseInt(capacity);
            rooms = rooms.filter(r => r.capacity >= cap);
        }
        if (status) {
            rooms = rooms.filter(r => r.currentStatus === status);
        }
        if (search) {
            const searchLower = search.toLowerCase();
            rooms = rooms.filter(r => r.id.toLowerCase().includes(searchLower));
        }

        const stats = {
            total: rooms.length,
            available: rooms.filter(r => r.currentStatus === 'available').length,
            occupied: rooms.filter(r => r.currentStatus === 'occupied').length,
            reserved: rooms.filter(r => r.currentStatus === 'reserved').length
        };

        res.json({ rooms, stats });
    } catch (error) {
        console.error('Error in GET /classrooms:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/classrooms/:id - Get single classroom
router.get('/:id', async (req, res) => {
    try {
        await initDB();
        const room = prepare('SELECT * FROM classrooms WHERE id = ?').get(req.params.id);
        if (!room) {
            return res.status(404).json({ error: 'Classroom not found' });
        }

        const statusInfo = getRoomStatus(room.id);
        const currentSlot = getCurrentTimeSlot();
        const today = getTodayName();
        const todayDate = getTodayDate();

        // Get today's schedule for this room
        const todaySchedule = prepare(`
            SELECT t.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM timetable t
            JOIN time_slots ts ON t.slot_id = ts.id
            WHERE t.room_id = ? AND t.day = ?
            ORDER BY ts.id
        `).all(room.id, today);

        // Get today's reservations
        const todayReservations = prepare(`
            SELECT r.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM reservations r
            JOIN time_slots ts ON r.slot_id = ts.id
            WHERE r.room_id = ? AND r.date = ?
            ORDER BY ts.id
        `).all(room.id, todayDate);

        res.json({
            ...room,
            amenities: room.amenities ? JSON.parse(room.amenities) : [],
            currentStatus: statusInfo.status,
            statusReason: statusInfo.reason,
            statusDetails: statusInfo,
            currentSlot,
            todaySchedule,
            todayReservations
        });
    } catch (error) {
        console.error('Error in GET /classrooms/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/classrooms/:id/slots - Get available slots for a room
router.get('/:id/slots', async (req, res) => {
    try {
        await initDB();
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'Date is required' });

        const slots = getAvailableSlotsForRoom(req.params.id, date);
        res.json(slots);
    } catch (error) {
        console.error('Error in GET /classrooms/:id/slots:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/classrooms/:id/status - Override room status (admin, requires auth)
router.put('/:id/status', requireAuth, async (req, res) => {
    try {
        await initDB();
        const { status, expiresIn } = req.body; // expiresIn in minutes
        const validStatuses = ['available', 'occupied', 'reserved'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        let expiresAt = null;
        if (expiresIn) {
            expiresAt = new Date(Date.now() + expiresIn * 60000).toISOString();
        }

        prepare(`
            UPDATE classrooms 
            SET status_override = ?, override_expires = ? 
            WHERE id = ?
        `).run(status, expiresAt, req.params.id);

        res.json({
            success: true,
            message: `Status updated to ${status}`,
            expiresAt
        });
    } catch (error) {
        console.error('Error in PUT /classrooms/:id/status:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/classrooms/:id/status - Clear status override (requires auth)
router.delete('/:id/status', requireAuth, async (req, res) => {
    try {
        await initDB();
        prepare(`
            UPDATE classrooms 
            SET status_override = NULL, override_expires = NULL 
            WHERE id = ?
        `).run(req.params.id);

        res.json({ success: true, message: 'Status override cleared' });
    } catch (error) {
        console.error('Error in DELETE /classrooms/:id/status:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
