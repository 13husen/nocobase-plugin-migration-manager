# Nocobase Migration Manager Plugin

A plugin for migrating collections, workflows, and UI schemas between Nocobase instances.

## 🚀 Quick Start

### 1. Extract Plugin
```bash
unzip plugin-migration-manager.zip
```

### 2. Copy to Nocobase
```bash
cp -r plugin-migration-manager /path/to/nocobase/packages/plugins/@nocobase/
```

### 3. Install & Build
```bash
cd /path/to/nocobase
yarn install
yarn build
```

### 4. Enable Plugin
```bash
yarn pm enable @nocobase/plugin-migration-manager
yarn dev
```

### 5. Access Plugin
- Login as admin
- Open **Settings** → **Migration Manager**

## ✨ Features

- ✅ Export Collections (structure only, no data)
- ✅ Export Workflows (full configuration)
- ✅ Export UI Schemas (page design)
- ✅ Safe Import (no data overwrite)
- ✅ Selective Migration
- ✅ UI Dashboard

## 📖 Usage Guide

### Export (Development)
1. Select collections, workflows, or UI schemas
2. Click "Export Selected Items"
3. A JSON file will be downloaded

### Import (Production)
1. Upload the exported JSON file
2. Review the confirmation
3. Click OK to import

## 🔒 Security

- ❌ Data is NOT exported (structure only)
- ❌ Data is NOT overwritten
- ✅ Incremental updates supported
- ✅ Only admins can access

## 📝 License

Apache-2.0 license
