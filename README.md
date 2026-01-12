# Classroom Availability Tracker

A real-time classroom availability system for college campuses built with Node.js, Express, and SQLite.

## Features

- 📊 **Real-time Dashboard** - View classroom availability with color-coded status
- 🔍 **Search & Filter** - Filter by block, floor, capacity, and status
- 👨‍💼 **Admin Panel** - Create reservations with conflict prevention
- 📱 **QR Codes** - Generate QR codes for quick room status checks
- ⏰ **Auto-reset** - Status updates automatically when time slots change

## Quick Start

```bash
npm install
npm run seed    # Populate with sample data
npm start       # Start server
```

Open http://localhost:3000

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (sql.js)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **QR Codes**: qrcode npm package

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/classrooms` | List all classrooms with current status |
| GET | `/api/classrooms/:id` | Get single classroom details |
| POST | `/api/reservations` | Create a new reservation |
| DELETE | `/api/reservations/:id` | Cancel a reservation |
| GET | `/api/qr/:roomId` | Generate QR code for a room |

## Deployment

This app is configured for deployment on Render. See `render.yaml` for configuration.

## License

MIT
