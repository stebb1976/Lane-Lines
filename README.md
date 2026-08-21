# Lane Lines — Swim Set Builder

A responsive, offline-capable swim-workout builder. It saves your set library in the browser on each device and can print any workout as a deck sheet or PDF.

## Use it on every device

This folder is a static web app: upload all of its files to any static host (for example, Netlify Drop, GitHub Pages, Cloudflare Pages, or a school web server). Use the resulting HTTPS link on your iPhone, iPad, MacBook, and any modern browser.

On iPhone or iPad, open the link in Safari, tap **Share**, then choose **Add to Home Screen**. It will behave like an app and stay available offline after its first visit.

## What it includes

- Workout blocks (warm-up, pre-set, main set, warm-down, etc.)
- Repetitions, distance, stroke, send-off interval, and coaching notes
- Running yardage/metre and estimated interval-time totals
- Duplicate/delete and quick-add set controls
- Device-local saved workout library
- Print/PDF deck sheets

## Important note about saved sets

Saved sets use browser storage, so the library does not automatically sync between devices. Printing a set to PDF is the built-in way to share it today. Adding signed-in cloud sync (for example through Supabase or Firebase) would be the natural next phase.
