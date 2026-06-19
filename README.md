# Tengah Commuter Dashboard 🚌

A high-performance, real-time web dashboard for Siew Fen & Hassan's commutes, monitoring bus stops on **Plantation Cres (Tengah)** and **UIC Building (Shenton Way)**.

Built using **TypeScript, React, Vite, Express, and Tailwind CSS**.

## Features

- 🚌 **Real-Time Data**: Queries the official **LTA DataMall v3 API** via HTTPS securely.
- 🛡️ **Graceful Fallback**: Automatically falls back to the community **ArriveLah API** if the official LTA API limit is hit or if the endpoint experiences downtime.
- 🌅 **Morning Commute HUD**: Automatically activates from 6 AM to 12 PM, highlighting buses **872** and **452** heading to Beauty World MRT.
- 🌇 **Evening Return HUD**: Automatically activates from 4 PM to 9 PM, highlighting return buses **674** and **872** back to Tengah.
- 🚏 **Focused Stop View**: Keeps clutter low—only shows relevant commute buses for the UIC Building stop rather than spamming 20+ unrelated city lines.
- ⚡ **Auto-Refresh**: Live timings poll every 30 seconds automatically (can be toggled on/off).

## Getting Started

### Prerequisites

Make sure you have Node.js installed (v18+ recommended).

### Installation

1. Navigate to the project directory:
   ```bash
   cd /Users/hassanhome/Documents/siewfen/code/tengah-bus-dashboard
   ```

2. The dependencies are already installed. If you ever need to re-install:
   ```bash
   npm install
   ```

### Running the Dashboard (Development)

Run both the Vite frontend (Port 3000) and the Express backend API proxy (Port 3001) concurrently:

```bash
npm run dev
```

Then, open your browser and visit: **`http://localhost:3000`**

### Running in Production Mode

To build and run the optimized production server:

```bash
npm run build
npm start
```

This will compile the TypeScript, bundle the React frontend, and serve everything from the high-performance Express server on **Port 3001** (`http://localhost:3001`).

## Tech Stack Details

- **Frontend**: Vite + React + TypeScript + Tailwind CSS + Lucide Icons
- **Backend (Proxy)**: Express + TypeScript + Node fetch
- **API Standard**: Standardizes and unifies payload responses from both **LTA v3** and **ArriveLah** so the frontend stays completely decoupled and lightweight.
