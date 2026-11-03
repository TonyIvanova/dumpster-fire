# Dump

Keep typing or it burns. Pick a time, start writing, and if you stop for too long your text is gone. Make it to the end and the note is saved, ready to edit.

- Hardcore mode: no backspace, delete, undo, cut or moving the caret
- Small pages that turn over as you write, with a page counter
- No red squiggles, and optional typo fixes as you go (offline, while writing only)
- Beige, light and dark backgrounds
- A 25×25 picture on the notes page that fills in by one square for each finished note
- Backups: download or restore a JSON file, or sync to Google Docs

Built with Angular. It's frontend only, with no server.

## Run it

```bash
npm install
```

```bash
npm start
```

Then open http://localhost:4200. To run the tests:

```bash
npm test
```

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests and builds every push to `main`, then publishes the result to the `gh-pages` branch.

1. Push this folder as the root of a GitHub repository, on the `main` branch.
2. After the first run, go to Settings > Pages in the repository and check that the source is **Deploy from a branch**, using `gh-pages`.

The build uses a relative base path and hash URLs, so it works under any repository name and reloads don't return a 404.

## Turn on Google Docs backup

The app needs an OAuth Client ID, which is public and safe to commit. Without one, the Google option stays hidden.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Enable the **Google Drive API**.
3. Set up the OAuth consent screen and add the `drive.file` scope. While the app is in Testing mode, add your Google account as a test user.
4. Create an OAuth client ID of type **Web application**. Under Authorized JavaScript origins, add `https://<your-username>.github.io` and `http://localhost:4200`.
5. Paste the ID into `src/app/config.ts` and push.
6. In the app, go to Notes and choose **Connect Google Docs**.

Each note becomes a Google Doc in a `Dump` folder in your Drive. The app can only see files it created.

### Limits

- Google gives browser-only apps a token that lasts about an hour. After that, click **Reconnect** to carry on syncing. Notes are always saved in the browser first.
- Sync goes one way. Edits made in Google Docs don't come back to notes you already have, and your next edit in the app overwrites them.
- **Restore from Google** only adds docs this browser doesn't have.
- Deleting a note here leaves its Google Doc in Drive.
- Notes live in this browser's localStorage, so clearing site data removes them. Keep a backup.

## Where things are

- `src/app/write`: the writing session (timer, burning, pages, hardcore)
- `src/app/editor`: editing a saved note
- `src/app/notes`: the notes list and backup controls
- `src/app/core`: autocorrect, storage and Google Docs sync
