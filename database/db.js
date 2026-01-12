const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'classroom_tracker.db');
let db = null;
let SQL = null;

// Initialize database
async function initDB() {
    if (db) return db;

    SQL = await initSqlJs();

    // Load existing database or create new one
    try {
        if (fs.existsSync(dbPath)) {
            const buffer = fs.readFileSync(dbPath);
            db = new SQL.Database(buffer);
        } else {
            db = new SQL.Database();
        }
    } catch (err) {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS classrooms (
            id TEXT PRIMARY KEY,
            block TEXT NOT NULL,
            floor INTEGER NOT NULL,
            capacity INTEGER NOT NULL,
            amenities TEXT,
            status_override TEXT,
            override_expires TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            label TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS timetable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            slot_id INTEGER NOT NULL,
            day TEXT NOT NULL,
            subject TEXT,
            faculty TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            slot_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            purpose TEXT,
            booked_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    saveDB();
    return db;
}

// Save database to file
function saveDB() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Helper methods to match better-sqlite3 API
function prepare(sql) {
    return {
        run: (...params) => {
            db.run(sql, params);
            saveDB();
            return { changes: db.getRowsModified(), lastInsertRowid: getLastInsertRowId() };
        },
        get: (...params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row;
            }
            stmt.free();
            return undefined;
        },
        all: (...params) => {
            const results = [];
            const stmt = db.prepare(sql);
            stmt.bind(params);
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        }
    };
}

function exec(sql) {
    db.exec(sql);
    saveDB();
}

function getLastInsertRowId() {
    const result = db.exec("SELECT last_insert_rowid() as id");
    return result[0]?.values[0]?.[0] || 0;
}

module.exports = {
    initDB,
    prepare,
    exec,
    saveDB,
    getDB: () => db
};
