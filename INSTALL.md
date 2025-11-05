# Installation Guide - Migration Manager Plugin

## Prerequisites

- Nocobase installed (Git source or create-nocobase-app)
- Node.js >= 18
- Yarn package manager
- Admin access to Nocobase

## Installation Steps

### Step 1: Extract ZIP
```bash
unzip plugin-migration-manager.zip
```

### Step 2: Copy to Nocobase
```bash
# Copy plugin to Nocobase plugins directory
cp -r plugin-migration-manager /path/to/your/nocobase/packages/plugins/@nocobase/

# Example:
# cp -r plugin-migration-manager D:/work/diawan/nocobase-new/packages/plugins/@nocobase/
```

### Step 3: Install Dependencies
```bash
cd /path/to/your/nocobase
yarn install
```

### Step 4: Build Plugin
```bash
# Build specific plugin
yarn build packages/plugins/@nocobase/plugin-migration-manager

# Or build all
yarn build
```

### Step 5: Enable Plugin

**Option A: Via UI**
1. Start server: `yarn dev`
2. Login as admin
3. Open **Plugin Manager**
4. Find "Migration Manager"
5. Click **Enable**

**Option B: Via CLI**
```bash
yarn pm enable @nocobase/plugin-migration-manager
```

### Step 6: Restart Server
```bash
# Stop server (Ctrl+C)
# Start again
yarn dev
```

### Step 7: Verify Installation
1. Login to Nocobase
2. Click **Settings** (gear icon)
3. You should see **Migration Manager** menu
4. Click to open the plugin

## Troubleshooting

### Plugin not showing
```bash
yarn clean
yarn build
yarn pm enable @nocobase/plugin-migration-manager
yarn dev
```

### Build errors
```bash
rm -rf packages/plugins/@nocobase/plugin-migration-manager/{lib,es,dist}
yarn build packages/plugins/@nocobase/plugin-migration-manager
```

### Permission denied
- Ensure you're logged in as admin
- Check ACL settings

## Uninstall

```bash
yarn pm disable @nocobase/plugin-migration-manager
rm -rf packages/plugins/@nocobase/plugin-migration-manager
```

## Support

For issues and questions, check:
- Server logs
- Browser console
- README.md for usage guide
