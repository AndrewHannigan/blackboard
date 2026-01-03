## Install & Run Locally

### Option 1: Dev Mode (Editable)
Launch from terminal, any code changes reflect immediately:
```bash
npm install
npm start
```

### Option 2: Build Local App
Install as a real macOS app (edits to source won't auto-reflect, need to rebuild):
```bash
npm install
npm run install-local
```

This creates `dist/mac/Whiteboard.app` - drag it to Applications or launch directly. To update after code changes, run `npm run install-local` again.