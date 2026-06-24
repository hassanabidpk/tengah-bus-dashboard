# AGENTS.md — TENGAH BUS DASHBOARD

**Location:** `/Users/hassanhome/Documents/siewfen/code/tengah-bus-dashboard`
**Live App URL:** https://tengah-bus-dashboard.vercel.app/
**GitHub Repository:** https://github.com/hassanabidpk/tengah-bus-dashboard

## 🚌 About the Project
A heavily optimized, mobile-first commute tracking dashboard for Tengah residents (Plantation Cres). It natively polls both the **LTA Datamall API (v3)** and **ArriveLah API** for redundancy.

Key features include:
* Auto-adapting Morning vs Evening tabs with location-aware commute logic.
* High-density, mobile-first layout preventing clipping or scroll-breaking on small screens.
* Retro London Bus SVGs dynamically rendering bus deck types (Double Decker, Bendy, or invisible SD placeholders).
* Real-time "LEAVE" notifications when walking buffers drop below 3 minutes.

## 🛠️ Stack & Architecture
* **Frontend:** React + Vite + Tailwind CSS + Lucide React icons (`src/App.tsx`)
* **Backend Proxy:** Express Node.js Server (`server/server.ts`)
* **Deployment:** Vercel (Auto-deploys from GitHub `main` branch)
* **Ports:** The backend proxy runs on `3001`. The frontend runs on `3002` (adjusted from 3000 to prevent collisions with Hassan's WhatsApp bridge).

## 🔒 Operational Directives for Agents

### 1. UI Constraints & Styling Rules
* **Mobile-First Absolute Density:** Do not revert the vertical timing card layout. Horizontal text labels like "Bus 870" have been intentionally pruned. If modifying the timing cards, you must preserve the `w-3.8rem` compact width and stacking order.
* **Bus Icons:** The London Bus SVGs (Double Decker and Bendy Bus) render above the time. Single Decker (SD) buses intentionally leave a blank empty `div` space to keep heights identical across all blocks without adding clutter.
* **Tailwind & Dark Mode:** Ensure any new elements adhere to the existing dark mode schema (`dark:bg-slate-900`, etc.). 

### 2. Live API Testing
* If editing LTA API calls, do not write test scripts in this codebase. Put scratch-pad tests in `/Users/hassanhome/scripts_archive/`.
* Singapore LTA Key is available in the environment or user `.hermes/.env` context. It is strictly injected on the `server.ts` side to prevent frontend leakage. 

### 3. Local Development Start
If you need to run the app locally to test logic with playwright/browser skills:
```bash
npm run dev
# Vite runs on http://localhost:3002
# Node API runs on http://localhost:3001
```
Make sure to `pkill` these processes once you are done!