# Nocobase Migration Manager Plugin

A plugin to migrate **collections**, **workflows**, and **UI Schemas** between Nocobase instances safely and efficiently.

## 🚀 Quick Start

### 1) Extract Plugin
```bash
unzip plugin-migration-manager.zip
```

### 2) Copy to Nocobase
```bash
cp -r plugin-migration-manager /path/to/nocobase/packages/plugins/@nocobase/
```

### 3) Install & Build
```bash
cd /path/to/nocobase
yarn install
yarn build
```

### 4) Enable Plugin
```bash
yarn pm enable @nocobase/plugin-migration-manager
yarn dev
```

### 5) Access Plugin
- Login as **admin**
- Go to **Settings → Migration Manager**

---

## ✨ Features

- ✅ **Export Collections** (structure only, no data)
- ✅ **Export Workflows** (full configuration)
- ✅ **Export UI Schemas** (page/layout/design)
- ✅ **Safe Import** with validation & preview
- ✅ **Selective Migration** (choose what to migrate)
- ✅ **Dashboard UI** for easy control
- ✅ **Merge for Collections** (insert & update)
- ✅ **Destroy-Insert / Overwrite** for **UI Schemas** & **Workflows**

---

## 🧠 Import Behavior Overview

| Type | Import Mode | Details |
|------|--------------|----------|
| **Collections** | **Merge (Insert + Update)** | - Inserts if not exist<br>- Updates if already exist (schema merge), **without deleting data** |
| **UI Schemas** | **Destroy-Insert (Overwrite)** | - If same identifier exists, the old one is deleted, then new one inserted<br>- Keeps UI fully synced with source |
| **Workflows** | **Destroy-Insert (Overwrite)** | - Drops existing workflow and re-creates from export package |

> ℹ️ **Menu/Navigation:**  
> Menus defined by **UI Schemas** are **overwritten** upon import, following the source export exactly.

### Preflight Checks
Before importing, the plugin will show a summary:
- New items vs items to update/overwrite
- Menu/navigation impact
- Identifier or name conflicts

### Matching Rules
- **Collections** are matched by **name**
- **UI Schemas** & **Workflows** are matched by **unique identifier (name/key)**

---

## 📦 How to Use

### A. Export (Development)
1. Select **collections**, **workflows**, or **UI schemas**
2. Click **Export Selected Items**
3. A **JSON** file will be downloaded (structure only)

### B. Import (Staging/Production)
1. Upload the exported **JSON** file
2. Review **preview/confirmation**
   - Collections: will **merge**
   - UI Schemas & Workflows: will **overwrite**
   - Menus: will be **replaced**
3. Confirm to start import

---

## 🔒 Security & Constraints

- ❌ **No record data is exported** — structure only  
- ❌ **No record overwrite** during collection merge  
- ✅ **Incremental updates** for collections (schema-level)  
- ✅ **Admin-only access** to plugin

---

## 🧩 Detailed Behavior

### 1) Collections → Merge (Insert + Update)
- New fields → **added**
- Existing fields → **updated** (compatible type/option only)
- Fields in target but not in source → **kept**
- Data rows remain safe and untouched

> ⚠️ **Note:** incompatible field type changes are skipped with a warning.

### 2) UI Schemas → Destroy-Insert (Overwrite)
- Deletes existing schema
- Inserts new version from export
- Ensures full 1:1 sync (no outdated fragments)
- Menu/navigation replaced accordingly

### 3) Workflows → Destroy-Insert (Overwrite)
- Drops and recreates identical workflow definition
- Includes nodes, triggers, and bindings

---

## ✅ Best Practices

- Always **backup** your database & configs before importing  
- Use **staging environment** for verification  
- **Separate export packages** per module/feature for clarity  
- Team should be aware that **UI Schemas & Workflows are overwritten**  
- Review the **import preview** carefully before applying changes  

---

## 🧪 Example Scenarios

### 1) Updating Collection Structure
- Developer adds `status` field to `orders`
- Exports only **collections: orders**
- Imports to production → `orders.status` added safely

### 2) Syncing Dashboard Layout
- Developer changes layout & menu
- Exports **uiSchemas**
- Imports to production → dashboard & menu overwritten with new version

### 3) Workflow Changes
- Developer updates workflow nodes & logic
- Exports **approval_flow**
- Imports → old workflow replaced with new definition

---

## 🗂️ Export File Format

```json
{
  "version": "1.0.0",
  "collections": [
    {
      "name": "orders",
      "fields": [
        { "name": "id", "type": "uuid", "primaryKey": true },
        { "name": "status", "type": "string", "allowNull": false, "default": "pending" }
      ]
    }
  ],
  "uiSchemas": [
    {
      "name": "dashboard_home",
      "schema": { /* schema definition */ }
    }
  ],
  "workflows": [
    {
      "name": "approval_flow",
      "definition": { /* nodes, edges, triggers */ }
    }
  ]
}
```

---

## ⚠️ Troubleshooting

- **Field type change failed** → perform DB migration manually  
- **Menu mismatch** → ensure full export for all related UI Schemas  
- **Workflow not triggered** → verify permissions & external dependencies  

---

## 🔐 Permissions

- Only **admin** users can access and use this plugin  
- All import operations require confirmation  

---

## 📄 License

Apache-2.0 License

---

## 🗺️ Roadmap

- Dry-run mode (simulate changes before import)  
- Partial overwrite for UI Schemas (scoped updates)  
- Schema compatibility validator  
