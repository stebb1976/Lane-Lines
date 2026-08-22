# Lane Lines

A responsive, offline-capable swim-workout builder. It saves your set library in the browser on each device and can print any workout as a deck sheet or PDF.

## Use it on every device

This folder is a static web app: upload all of its files to any static host (for example, Netlify Drop, GitHub Pages, Cloudflare Pages, or a school web server). Use the resulting HTTPS link on your iPhone, iPad, MacBook, and any modern browser.

The repository includes a GitHub Pages workflow. Pushes to `codex/show-local-data-folder` or `main` publish the Lane Lines web app and create a clickable `github-pages` deployment in GitHub. The workflow can also be run manually from the Actions tab.

On iPhone or iPad, open the link in Safari, tap **Share**, then choose **Add to Home Screen**. It will behave like an app and stay available offline after its first visit.

## What it includes

- Workout blocks (warm-up, pre-set, main set, warm-down, etc.)
- Repetitions, distance, stroke, send-off interval, and coaching notes
- Running yardage/metre and estimated interval-time totals
- Duplicate/delete and quick-add set controls
- Scheduler library selection with Schedule, Preview, and Edit workflows
- Source-aware workout saving for the Library, Log, and Scheduler
- Device-local saved workout library
- Print/PDF deck sheets

## Important note about saved sets

Saved sets use browser storage, so the library does not automatically sync between devices. Printing a set to PDF is the built-in way to share it today. Adding signed-in cloud sync (for example through Supabase or Firebase) would be the natural next phase.

## Local data store

Run `npm start`, open Settings, and use **Browse** to select a data store location. The absolute path is saved as `dataStorePath` in the project metadata file `ll_project.json` and restored at startup. The app immediately writes changes to `ll_workouts.json`, `ll_drills.json`, `ll_blocks.json`, `ll_log.json`, and `ll_schedule.json` in that folder; browser storage is only a working cache, not the authoritative source for the configured path. GitHub is contacted only when the user explicitly chooses Push, Pull, or Merge.

On iPhone and iPad, Safari does not provide web apps access to an arbitrary writable folder. There, **Browse** initializes Safari's private on-device file system instead. The read-only location field identifies that storage, and `ll_project.json` plus the same five `ll_*.json` data files are persisted there and restored at startup.

## Personal GitHub backup

Each user can create and control a separate GitHub repository, then enter its `owner/repository`, branch, and fine-grained token in Settings. Manual Push, Pull, and Merge operations use `ll_workouts.json`, `ll_drills.json`, `ll_blocks.json`, `ll_log.json`, and `ll_schedule.json` at the root of that personal repository. Restrict the token to that repository with Contents read/write permission.
