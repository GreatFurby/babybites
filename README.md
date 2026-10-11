# BabyBites

BabyBites is an offline-first, mobile-friendly freezer inventory for homemade baby food. It is built for quick daily use on an Android phone and is entirely in Belgian Dutch.

There is no account, server, cloud database, tracking, or subscription. All data lives locally in the browser's IndexedDB storage.

## What it does

- Shows freezer stock per recipe, oldest prepared portions first.
- Keeps stable numbered containers, starting with 1 through 24.
- Lets you enter a whole batch at once and adjust each selected pot's weight.
- Lets you clear multiple used containers in one go.
- Protects recipes and containers that are still in use.
- Creates a portable JSON back-up that can be shared through Android's share menu or downloaded.
- Restores a validated JSON back-up atomically, so a bad file cannot partly replace the current data.
- Works offline after the first successful load and installation.

## Local setup

Install a current LTS version of Node.js (Node 20 or newer), then run:

    npm install
    npm run dev

Open the address Vite prints in the terminal.

Useful commands:

    npm test
    npm run build
    npm run preview

Running npm run build creates the deployable static site in the dist folder.

## Deploy with GitHub and Vercel

Vercel is the simplest recommended route because the app is already configured for a normal root-domain Vite deployment.

1. Create a new GitHub repository, for example BabyBites.
2. Upload this whole project, including package.json and package-lock.json, but not node_modules or dist.
3. In Vercel, choose **Add New → Project** and import that GitHub repository.
4. Vercel should detect **Vite** automatically. Leave the build command as npm run build and the output directory as dist.
5. Deploy. Vercel gives you an HTTPS address.

No environment variables or backend configuration are needed.

## Install on Kelly's Android phone

1. Open the Vercel address in Chrome while online.
2. Tap Chrome's three-dot menu.
3. Choose **Install app** (or **Toevoegen aan startscherm** if Chrome uses that wording).
4. Confirm. BabyBites then opens like a normal app, without Chrome's navigation bar.

After the first successful load, the app shell is cached and the normal inventory, recipe, entry, emptying, and backup features work in airplane mode too.

## Back-up and restore

BabyBites deliberately keeps this simple:

- In **Instellingen**, use **Back-up delen** to create a file named BabyBites-backup-YYYY-MM-DD.json.
- On Android, the native share sheet lets you mail it to yourself or save it where you prefer.
- Use **Back-up herstellen** on a new phone, after a browser reset, or whenever you want to restore a saved state.

Restoring replaces the current BabyBites data. Use a fresh back-up before moving to another phone or clearing browser data.

## Data and privacy

The data is tied to the browser and site address on that phone. Updating the deployed app does not erase it, but clearing Chrome site data, switching phones, or using a different address starts a separate local store. Keep an occasional JSON back-up for those situations.

## Technical notes

- React + TypeScript + Vite
- Dexie / IndexedDB for local persistence
- vite-plugin-pwa generates the web app manifest and service worker
- No runtime CDN dependencies
- Dates are stored as YYYY-MM-DD calendar dates and displayed as DD/MM/YYYY, avoiding timezone-shifted preparation dates
