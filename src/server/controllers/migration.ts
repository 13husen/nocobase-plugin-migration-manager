import { Context } from '@nocobase/actions';

type Id = string | number;

export interface ExportBody {
  collections?: string[];
  workflows?: Id[];
  uiSchemas?: string[];
}

export interface FieldRow {
  name: string;
  type?: string;
  interface?: string;
  options?: any;
}

export interface CollectionBundle {
  name: string;
  title?: string;
  primaryKey?: string;
  fields?: FieldRow[];
}

function asArray<T = any>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
function isPlainObject(v: any) {
  return v && typeof v === 'object' && v.constructor === Object;
}
function isEmptyObject(v: any) {
  return isPlainObject(v) && Object.keys(v).length === 0;
}

type AnyObj = Record<string, any>;



type RouteType = 'page' | 'tabs' | 'menu' | 'group' | 'link' | string

interface RouteBundle {
  title?: string | null
  tooltip?: string | null
  icon?: string | null
  schemaUid: string | null
  menuSchemaUid?: string | null
  tabSchemaName?: string | null
  type?: RouteType | null
  options?: unknown
  sort?: number | null
  hideInMenu?: boolean | null
  enableTabs?: boolean | null
  enableHeader?: boolean | null
  displayTitle?: string | null
  hidden?: boolean | null
  routeRef?: number | string | null
  parentRef?: number | string | null
  children?: RouteBundle[]
  [k: string]: unknown
}

type AnyRow = Record<string, any>;

function pickRouteFields(r: AnyRow) {
  return {
    title: r.title ?? null,
    tooltip: r.tooltip ?? null,
    icon: r.icon ?? null,
    schemaUid: r.schemaUid ?? null,
    menuSchemaUid: r.menuSchemaUid ?? null,
    tabSchemaName: r.tabSchemaName ?? null,
    type: r.type ?? null,
    options: r.options ?? null,
    sort: r.sort ?? null,
    hideInMenu: r.hideInMenu ?? null,
    enableTabs: r.enableTabs ?? null,
    enableHeader: r.enableHeader ?? null,
    displayTitle: r.displayTitle ?? null,
    hidden: r.hidden ?? null,
  };
}

export class MigrationController {
  static async export(ctx: Context) {
    const actionParams: any = ctx.action?.params || {};
    const reqBody: any = ctx.request.body || {};
    const requestData: any =
      (actionParams.data && Object.keys(actionParams.data).length ? actionParams.data : undefined) ||
      (reqBody.data && Object.keys(reqBody.data).length ? reqBody.data : undefined) ||
      (actionParams.values && Object.keys(actionParams.values).length ? actionParams.values : undefined) ||
      (Object.keys(reqBody).length ? reqBody : undefined) ||
      {};
  
    const collections = asArray<string>(requestData.collections);
    const workflows = asArray<Id>(requestData.workflows);
    const uiSchemasInput = asArray<any>(requestData.uiSchemas);
    const routesInput = asArray<any>(requestData.desktopRoutes || requestData.routes);
  
    const db: any = ctx.db;
    const app: any = ctx.app;
  
    try {
      const collectionsRepo = db.getRepository('collections');
      const fieldsRepo = db.getRepository('fields');
      const workflowRepo = db.getRepository('workflows');
      const routeRepo = db.getRepository('desktopRoutes');
      const uiSchemaRepo = db.getRepository('uiSchemas');
  
      const payload = {
        version: typeof app?.version === 'string' ? app.version : 'unknown',
        exportDate: new Date().toISOString(),
        collections: [] as any[],
        workflows: [] as any[],
        uiSchemas: [] as any[],
        desktopRoutes: [] as any[],
      };
  
      for (const name of collections) {
        try {
          const colMeta = await collectionsRepo.findOne({ filter: { name } });
          if (!colMeta) continue;
          const primaryKey = colMeta.get('primaryKey') || 'id';
          const title = colMeta.get('title') || name;
          const template = colMeta.get('template') || 'general';
          const runtimeCol = (() => { try { return db.getCollection(name); } catch { return null; } })();
          const fieldRows = await fieldsRepo.find({ filter: { collectionName: name } });
          const fields: FieldRow[] = (fieldRows || []).map((r: any) => {
            const row = r.get ? r.get() : r;
            let options = row.options ?? {};
            if (isEmptyObject(options) && runtimeCol) {
              try {
                const rf = runtimeCol.getField(row.name);
                if (rf?.options && !isEmptyObject(rf.options)) options = rf.options;
              } catch {}
            }
            return { name: row.name, type: row.type, interface: row.interface, options };
          });
          payload.collections.push({ name, title, primaryKey, template, fields } as CollectionBundle);
        } catch {}
      }
  
      for (const id of workflows) {
        try {
          const wRow = await workflowRepo.findOne({ filter: { id }, appends: ['nodes'] });
          if (!wRow) continue;
          const w = wRow.get ? wRow.get() : wRow;
          const idToKey = new Map<number, string>();
          for (const n of (w.nodes || [])) idToKey.set(n.id, n.key);
          const nodes = (w.nodes || []).map((n: any) => ({
            key: n.key,
            type: n.type,
            title: n.title ?? null,
            upstreamKey: n.upstreamId ? idToKey.get(n.upstreamId) ?? null : null,
            downstreamKey: n.downstreamId ? idToKey.get(n.downstreamId) ?? null : null,
            branchIndex: n.branchIndex ?? null,
            config: n.config ?? {},
          }));
          payload.workflows.push({
            key: w.key,
            title: w.title ?? null,
            description: w.description ?? null,
            type: w.type,
            sync: !!w.sync,
            current: true,
            triggerTitle: w.triggerTitle ?? null,
            options: w.options ?? {},
            config: w.config ?? {},
            nodes,
          });
        } catch {}
      }
  
      const getCompleteSchemaTree = async (uid: string) => {
        try {
          const schema = await uiSchemaRepo.getJsonSchema(uid);
          return schema || null;
        } catch { return null; }
      };
  
      const pushedUids = new Set<string>();
      const pushSchemaPayload = async (uid: string, sourceType: string) => {
        if (!uid || pushedUids.has(uid)) return;
        const schema = await getCompleteSchemaTree(uid);
        if (schema) {
          payload.uiSchemas.push({ mode: 'complete', rootUid: uid, sourceType, data: schema });
          pushedUids.add(uid);
        }
      };
  
      for (const item of uiSchemasInput) {
        try {
          if (typeof item === 'string') { await pushSchemaPayload(item, 'direct'); continue; }
          if (isPlainObject(item) && item.uid) { await pushSchemaPayload(String(item.uid), 'direct'); continue; }
        } catch {}
      }
  
      const allRoutesRaw = await routeRepo.find();
      const allRoutes = (allRoutesRaw || []).map((x: any) => (x.get ? x.get() : x));
  
      const byId = new Map<number, any>();
      const childrenMap = new Map<number | null, any[]>();
      for (const r of allRoutes) {
        byId.set(r.id, r);
        const pid = r.parentId ?? null;
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(r);
      }
  
      const selectedRoots: any[] = [];
      for (const r of routesInput) {
        let row: any = null;
        if (typeof r === 'number' || /^\d+$/.test(String(r))) {
          row = await routeRepo.findOne({ filter: { id: Number(r) } });
          row = row ? (row.get ? row.get() : row) : null;
        } else if (isPlainObject(r) && (r.id || r.routeId)) {
          const rid = Number(r.id ?? r.routeId);
          row = byId.get(rid) || null;
        } else if (typeof r === 'string') {
          row = allRoutes.find((x: any) => x.schemaUid === r) || null;
        }
        if (row) selectedRoots.push(row);
      }
  
      const pickRouteFields = (r: any) => ({
        title: r.title ?? null,
        tooltip: r.tooltip ?? null,
        icon: r.icon ?? null,
        schemaUid: r.schemaUid ?? null,
        menuSchemaUid: r.menuSchemaUid ?? null,
        tabSchemaName: r.tabSchemaName ?? null,
        type: r.type ?? null,
        options: r.options ?? null,
        sort: r.sort ?? null,
        hideInMenu: r.hideInMenu ?? null,
        enableTabs: r.enableTabs ?? null,
        enableHeader: r.enableHeader ?? null,
        displayTitle: r.displayTitle ?? null,
        hidden: r.hidden ?? null,
      });
  
      const buildTree = async (node: any, parentType: string | null): Promise<any | null> => {
        const t = String(node.type || '').toLowerCase();
  
        if (t === 'tabs') {
          if (parentType === 'page') {
            if (node.schemaUid) await pushSchemaPayload(String(node.schemaUid), 'tabs');
            return {
              type: 'tabs',
              schemaUid: node.schemaUid ?? null,
              tabSchemaName: node.tabSchemaName ?? null,
              hidden: !!node.hidden,
            };
          }
          return null;
        }
  
        const entry: any = pickRouteFields(node);
        if (node.schemaUid) {
          await pushSchemaPayload(String(node.schemaUid), String(node.type || 'route'));
        }
  
        const kids = childrenMap.get(node.id) || [];
        const tabKids = kids.filter((k: any) => String(k.type || '').toLowerCase() === 'tabs');
        const otherKids = kids.filter((k: any) => String(k.type || '').toLowerCase() !== 'tabs');
  
        entry.children = [];
        if (t === 'page' && tabKids.length) {
          for (const tk of tabKids) {
            const packed = await buildTree(tk, 'page');
            if (packed) entry.children.push(packed);
          }
        }
        for (const ok of otherKids) {
          const childEntry = await buildTree(ok, t);
          if (childEntry) entry.children.push(childEntry);
        }
  
        return entry;
      };
      for (const root of selectedRoots) {
        const built = await buildTree(root, null);
        if (built) payload.desktopRoutes.push(built);
      }

  
      ctx.status = 200;
      ctx.type = 'application/json';
      ctx.body = { success: true, data: payload };
    } catch (err: any) {
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { success: false, message: String(err.message || 'Export failed'), stack: err.stack };
    }
  }
  
  static async import(ctx: Context) {
    const actionParams: any = ctx.action?.params || {};
    const app: any = (ctx as any).app;
    const reqBody: any = ctx.request.body || {};
    let importData: any =
      (actionParams.data && Object.keys(actionParams.data).length ? actionParams.data : undefined) ||
      (reqBody.data && Object.keys(reqBody.data).length ? reqBody.data : undefined) ||
      (actionParams.values && Object.keys(actionParams.values).length ? actionParams.values : undefined) ||
      reqBody;
  
    const collections = asArray(importData?.collections);
    const workflows = asArray(importData?.workflows);
    const uiSchemas = asArray(importData?.uiSchemas);
    const desktopRoutes = asArray(importData?.desktopRoutes || importData?.routes);
    const options = isPlainObject(importData?.options) ? importData.options : {};
    const preview = !!options.preview;
    const overwrite = !!options.overwrite;
  
    const db: any = ctx.db;
  
    const results: any = {
      collections: { success: 0, failed: 0, skipped: 0, updated: 0, errors: [] as any[], pendingCreates: [] as any[] },
      workflows: { success: 0, failed: 0, skipped: 0, updated: 0, errors: [] as any[], pendingCreates: [] as any[] },
      uiSchemas: { success: 0, failed: 0, skipped: 0, updated: 0, errors: [] as any[], pendingCreates: [] as any[] },
      desktopRoutes: { success: 0, failed: 0, skipped: 0, updated: 0, errors: [] as any[], pendingCreates: [] as any[] },
    };
  
    try {
      const collectionsRepo = db.getRepository('collections');
      const fieldsRepo = db.getRepository('fields');
  
      for (const colConfig of collections) {
        const collectionName = colConfig.name;
        try {
          const existingColMeta = await collectionsRepo.findOne({ filter: { name: collectionName } });
          if (!existingColMeta) {
            if (preview) {
              results.collections.pendingCreates.push({
                collection: collectionName,
                title: colConfig.title || collectionName,
                fieldsCount: (colConfig.fields || []).length,
              });
            } else {
              await collectionsRepo.create({
                values: {
                  name: collectionName,
                  title: colConfig.title || collectionName,
                  template: colConfig.template || 'general',
                  logging: true,
                  autoGenId: true,
                  createdBy: true,
                  updatedBy: true,
                  createdAt: true,
                  updatedAt: true,
                  sortable: true,
                  primaryKey: colConfig.primaryKey || 'id',
                  dataSource: 'main',
                },
              });
              for (const f of colConfig.fields || []) {
                await fieldsRepo.create({
                  values: {
                    collectionName,
                    name: f.name,
                    type: f.type || 'string',
                    interface: f.interface || 'input',
                    dataSource: 'main',
                    ...(f.options || {}),
                  },
                });
              }
            }
            results.collections.success++;
          } else {
            for (const fieldCfg of colConfig.fields || []) {
              const existingField = await fieldsRepo.findOne({ filter: { name: fieldCfg.name, collectionName } });
              if (!existingField && !preview) {
                await fieldsRepo.create({
                  values: {
                    name: fieldCfg.name,
                    type: fieldCfg.type || 'string',
                    interface: fieldCfg.interface || 'input',
                    collectionName,
                    dataSource: 'main',
                    ...(fieldCfg.options || {}),
                  },
                });
              } else if (existingField && overwrite && !preview) {
                await fieldsRepo.update({
                  filterByTk: existingField.get('id'),
                  values: {
                    type: fieldCfg.type || existingField.get('type'),
                    interface: fieldCfg.interface || existingField.get('interface'),
                    ...(fieldCfg.options || {}),
                  },
                });
                results.collections.updated++;
              } else if (!existingField && preview) {
                results.collections.pendingCreates.push({ collection: collectionName, field: fieldCfg.name });
              } else {
                results.collections.skipped++;
              }
            }
            results.collections.success++;
          }
        } catch (err: any) {
          results.collections.failed++;
          results.collections.errors.push({ collection: collectionName, error: String(err.message || err) });
        }
      }
  
      const workflowRepo = db.getRepository('workflows');
      let flowNodeRepo: any = null;
      try { flowNodeRepo = db.getRepository('flowNodes'); } catch {}
      if (!flowNodeRepo) { try { flowNodeRepo = db.getRepository('flow_nodes'); } catch {} }
      if (!flowNodeRepo) { try { flowNodeRepo = db.getRepository('nodes'); } catch {} }
      if (!flowNodeRepo) throw new Error('flowNodes repository not found');
  
      for (const wf of workflows) {
        try {
          if (!wf || !wf.title || !wf.type) {
            results.workflows.skipped++;
            continue;
          }
  
          let existingWorkflow = null;
  
          if (wf.key) {
            existingWorkflow = await workflowRepo.findOne({
              filter: { key: wf.key },
              appends: ['nodes']
            });
          }
  
          if (!existingWorkflow) {
            const allWorkflows = await workflowRepo.find({
              filter: {
                title: wf.title,
                type: wf.type
              },
              appends: ['nodes']
            });
            if (allWorkflows && allWorkflows.length > 0) {
              existingWorkflow = allWorkflows[0];
            }
          }
  
          if (existingWorkflow && !overwrite) {
            results.workflows.skipped++;
            continue;
          }
  
          if (preview) {
            results.workflows.pendingCreates.push({
              key: wf.key || '(auto)',
              title: wf.title,
              action: existingWorkflow ? 'update' : 'create'
            });
            results.workflows.success++;
            continue;
          }
  
          let workflowId: number;
  
          if (existingWorkflow && overwrite) {
            await workflowRepo.update({
              filterByTk: existingWorkflow.get('id'),
              values: {
                title: wf.title,
                type: wf.type,
                sync: !!wf.sync,
                description: wf.description ?? null,
                triggerTitle: wf.triggerTitle ?? null,
                options: wf.options ?? {},
                config: wf.config ?? {},
              },
            });
            workflowId = existingWorkflow.get('id');
  
            const oldNodes = existingWorkflow.get('nodes') || [];
            for (const oldNode of oldNodes) {
              await flowNodeRepo.destroy({ filterByTk: oldNode.id });
            }
  
            results.workflows.updated++;
          } else {
            const createdW = await workflowRepo.create({
              values: {
                current: true,
                title: wf.title,
                type: wf.type,
                sync: !!wf.sync,
                description: wf.description ?? null,
                triggerTitle: wf.triggerTitle ?? null,
                options: wf.options ?? {},
                config: wf.config ?? {},
              },
            });
            workflowId = createdW?.get ? createdW.get('id') : createdW?.id;
            results.workflows.success++;
          }
  
          const nodesInput: any[] = Array.isArray(wf.nodes) ? wf.nodes : [];
          const keyToId = new Map<string, number>();
          const existingByKey = new Map<string, any>();
          try {
            const existingNodes = await flowNodeRepo.find({ filter: { workflowId } });
            for (const en of existingNodes || []) {
              const row = en.get ? en.get() : en;
              if (row.key) existingByKey.set(row.key, row);
            }
          } catch {}
  
          for (const n of nodesInput) {
            if (!n || !n.key) continue;
            const existing = existingByKey.get(n.key);
            if (existing) {
              const id = existing.id ?? existing.get?.('id');
              await flowNodeRepo.update({
                filterByTk: id,
                values: {
                  type: n.type ?? existing.type ?? null,
                  title: n.title ?? existing.title ?? null,
                  config: n.config ?? existing.config ?? {},
                  branchIndex: n.branchIndex ?? null,
                },
              });
              keyToId.set(n.key, Number(id));
            } else {
              const created = await flowNodeRepo.create({
                values: {
                  workflowId,
                  key: n.key,
                  type: n.type,
                  title: n.title ?? null,
                  config: n.config ?? {},
                  upstreamId: null,
                  downstreamId: null,
                  branchIndex: n.branchIndex ?? null,
                },
              });
              const id = created?.get ? created.get('id') : created?.id;
              if (n.key) keyToId.set(n.key, Number(id));
            }
          }
  
          if (overwrite) {
            try {
              const existingNodes = await flowNodeRepo.find({ filter: { workflowId } });
              const inputKeys = new Set(nodesInput.filter(x => x && x.key).map(x => x.key));
              for (const en of existingNodes || []) {
                const row = en.get ? en.get() : en;
                if (row.key && !inputKeys.has(row.key)) {
                  await flowNodeRepo.destroy({ filterByTk: row.id });
                }
              }
            } catch {}
          }
  
          for (const n of nodesInput) {
            if (!n || !n.key) continue;
            const id = keyToId.get(n.key);
            if (!id) continue;
            const upstreamId = n.upstreamKey ? (keyToId.get(n.upstreamKey) ?? null) : null;
            const downstreamId = n.downstreamKey ? (keyToId.get(n.downstreamKey) ?? null) : null;
            await flowNodeRepo.update({
              filterByTk: id,
              values: {
                upstreamId,
                downstreamId,
                branchIndex: n.branchIndex ?? null,
              },
            });
          }
        } catch (e: any) {
          results.workflows.failed++;
          results.workflows.errors.push({
            workflow: wf?.title || wf?.key || 'unknown',
            error: String(e?.message || e),
          });
        }
      }
  
      const routeRepo = db.getRepository('desktopRoutes');
      const uiSchemaRepo = db.getRepository('uiSchemas');
      const treeRepo = db.getRepository('uiSchemaTreePath');
  
      const createRouteRecursive = async (node: any, parentId: number | null) => {
        try {
          const nodeType = String(node.type || '').toLowerCase();
  
          if (nodeType === 'tabs') {
            return null;
          }
  
          if (node?.schemaUid && nodeType !== 'link') {
            const existBySchema = await routeRepo.findOne({ filter: { schemaUid: node.schemaUid } });
            if (existBySchema) {
              results.desktopRoutes.skipped++;
              return existBySchema.get ? existBySchema.get('id') : existBySchema.id;
            }
          }
  
          const values: any = {
            parentId,
            title: node.title ?? null,
            tooltip: node.tooltip ?? null,
            icon: node.icon ?? null,
            schemaUid: node.schemaUid ?? null,
            menuSchemaUid: node.menuSchemaUid ?? null,
            tabSchemaName: node.tabSchemaName ?? null,
            type: node.type ?? null,
            options: node.options ?? null,
            sort: node.sort ?? null,
            hideInMenu: node.hideInMenu ?? null,
            enableTabs: node.enableTabs ?? null,
            enableHeader: node.enableHeader ?? null,
            displayTitle: node.displayTitle ?? null,
            hidden: node.hidden ?? null,
          };
  
          const tabsChildren = asArray(node.children).filter((c: any) => String(c?.type).toLowerCase() === 'tabs');
          if (nodeType === 'page' && tabsChildren.length > 0) {
            values.children = tabsChildren.map((c: any) => ({
              type: 'tabs',
              schemaUid: c.schemaUid || null,
              tabSchemaName: c.tabSchemaName || null,
              hidden: !!c.hidden,
            }));
          }
  
          if (preview) {
            results.desktopRoutes.success++;
            let fakeId = 0;
            for (const child of asArray(node.children)) {
              const ct = String(child?.type || '').toLowerCase();
              if (ct === 'tabs' && nodeType === 'page') continue;
              await createRouteRecursive(child, fakeId);
            }
            return null;
          }
  
          const created = await routeRepo.create({ values });
          const newId = created?.get ? created.get('id') : created?.id;
          results.desktopRoutes.success++;
  
          for (const child of asArray(node.children)) {
            const ct = String(child?.type || '').toLowerCase();
            if (ct === 'tabs' && nodeType === 'page') continue;
            await createRouteRecursive(child, newId);
          }
  
          return newId;
        } catch (e: any) {
          results.desktopRoutes.failed++;
          results.desktopRoutes.errors.push({ route: node?.title || node?.schemaUid || 'unknown', error: String(e.message || e) });
          return null;
        }
      };
  
      for (const root of desktopRoutes) {
        await createRouteRecursive(root, null);
      }
  
      for (const bundle of uiSchemas) {
        try {
          const uid = bundle?.rootUid;
          const data = bundle?.data;
          if (!uid || !data) { results.uiSchemas.failed++; continue; }
  
          if (preview) {
            results.uiSchemas.pendingCreates.push({ uid, action: 'replace' });
            results.uiSchemas.success++;
            continue;
          }
  
          const exist = await uiSchemaRepo.findOne({ filter: { 'x-uid': uid } });
  
          if (exist) {
            try { if (app.schemaManager?.removeSchema) await app.schemaManager.removeSchema(uid); } catch {}
            try { await treeRepo.destroy({ filter: { ancestor: uid }, force: true }); } catch {}
            try { await treeRepo.destroy({ filter: { descendant: uid }, force: true }); } catch {}
            try { await uiSchemaRepo.destroy({ filter: { 'x-uid': uid }, force: true }); } catch {}
          }
  
          if (typeof (uiSchemaRepo as any).insert === 'function') {
            await (uiSchemaRepo as any).insert(data);
          } else {
            await uiSchemaRepo.create({ values: { 'x-uid': uid, name: data?.name || '', schema: data } });
            const ex0 = await treeRepo.findOne({ filter: { ancestor: uid, descendant: uid, depth: 0 } });
            if (!ex0) {
              await treeRepo.create({ values: { ancestor: uid, descendant: uid, depth: 0, async: false, type: null, sort: null } });
            }
          }
  
          if (exist) results.uiSchemas.updated++; else results.uiSchemas.success++;
        } catch (e: any) {
          results.uiSchemas.failed++;
          results.uiSchemas.errors.push({ schema: bundle?.rootUid || 'unknown', error: String(e.message || e) });
        }
      }
  
      const totalProcessed = collections.length + workflows.length + uiSchemas.length + desktopRoutes.length;
      const totalSuccess = results.collections.success + results.workflows.success + results.uiSchemas.success + results.desktopRoutes.success;
      const totalUpdated = results.collections.updated + results.workflows.updated + results.uiSchemas.updated + results.desktopRoutes.updated;
  
      ctx.status = 200;
      ctx.type = 'application/json';
      ctx.body = {
        success: totalSuccess > 0 || totalUpdated > 0,
        preview,
        overwrite,
        results,
        summary: {
          totalProcessed,
          totalSuccess,
          totalUpdated,
          totalFailed: results.collections.failed + results.workflows.failed + results.uiSchemas.failed + results.desktopRoutes.failed,
          totalSkipped: results.collections.skipped + results.workflows.skipped + results.uiSchemas.skipped + results.desktopRoutes.skipped,
        },
        message: preview
          ? 'Preview completed. Set preview:false to apply changes.'
          : (totalSuccess + totalUpdated) > 0
            ? `Import completed. ${totalSuccess} created, ${totalUpdated} updated.`
            : 'No changes applied.',
      };
    } catch (err: any) {
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { success: false, message: String(err.message || 'Import failed'), stack: err.stack };
    }
  }
  
  
  static async list(ctx: Context) {
    const db: any = ctx.db;
  
    try {
      const collectionsRepo = db.getRepository('collections');
      const fieldsRepo = db.getRepository('fields');
      const workflowRepo = db.getRepository('workflows');
      const routeRepo = db.getRepository('desktopRoutes');
  
      const colRows = await collectionsRepo.find();
      const cols = (colRows || []).map((r: any) => (r.get ? r.get() : r));
  
      const nonSystem = cols.filter((c: any) => !(c?.options && c.options.origin));
      const names = nonSystem.map((c: any) => c.name);
  
      const fldRows = await fieldsRepo.find({ filter: { collectionName: { $in: names } } });
      const fieldsByCollection = new Map<string, number>();
      for (const fr of fldRows || []) {
        const row = fr.get ? fr.get() : fr;
        const k = String(row.collectionName || '');
        fieldsByCollection.set(k, (fieldsByCollection.get(k) || 0) + 1);
      }
  
      const collectionsArray = nonSystem
        .map((c: any) => ({
          name: String(c.name || ''),
          title: String((c.title || c.name || '')),
          fields: Number(fieldsByCollection.get(String(c.name || '')) || 0),
        }))
        .filter((c) => !!c.name && !c.name.startsWith('_'))
        .sort((a, b) => a.name.localeCompare(b.name));
  
      let workflows: any[] = [];
      try {
        const workflowsData = await workflowRepo.find();
        workflows = (workflowsData || []).map((w: any) => ({
          id: w.get('id'),
          title: String(w.get('title') || ''),
          key: String(w.get('key') || ''),
          enabled: Boolean(w.get('enabled')),
        }));
      } catch {}
  
      let uiSchemas: any[] = [];
      try {
        const routes = await routeRepo.find();
        const routeRows = (routes || []).map((r: any) => (r.get ? r.get() : r));
  
        const schemaTypes = new Set<string>(['page', 'menu', 'group']);
        const linkTypes = new Set<string>(['link']);
        const roots = routeRows.filter((r) => r.parentId == null);
  
        const schemaEntries = roots
          .filter((r) => !!r.schemaUid && schemaTypes.has(String(r.type || '').toLowerCase()))
          .map((r) => ({
            routeId: r.id,
            displayTitle: r.title || r.displayTitle || 'Untitled',
            type: r.type || '',
            uid: r.schemaUid || null,
            schemaUid: r.schemaUid || null,
            menuSchemaUid: r.menuSchemaUid || null,
            isLink: false,
            linkTarget: null,
          }));
  
        const linkEntries = roots
          .filter((r) => linkTypes.has(String(r.type || '').toLowerCase()))
          .map((r) => ({
            routeId: r.id,
            displayTitle: r.title || r.displayTitle || 'Untitled',
            type: r.type || 'link',
            uid: r.schemaUid || null,
            schemaUid: r.schemaUid || null,
            menuSchemaUid: r.menuSchemaUid || null,
            isLink: true,
            linkTarget: r.options?.to ?? r.options?.url ?? r.options?.path ?? null,
          }));
  
        uiSchemas = [...schemaEntries, ...linkEntries];
      } catch {}
  
      ctx.status = 200;
      ctx.type = 'application/json';
      ctx.body = {
        success: true,
        data: {
          collections: collectionsArray,
          workflows,
          uiSchemas,
        },
      };
    } catch (err: any) {
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { success: false, message: String(err.message || 'List failed') };
    }
  }
  
  static async validate(ctx: Context) {
    const importData = ctx.action?.params?.values || ctx.request.body || {};
    const collections = asArray(importData?.collections);
    const workflows = asArray(importData?.workflows);
    const uiSchemas = asArray(importData?.uiSchemas);
    const db: any = ctx.db;

    try {
      const validation = { valid: true, warnings: [] as any[], errors: [] as any[] };

      const collectionsRepo = db.getRepository('collections');
      const fieldsRepo = db.getRepository('fields');

      for (const col of collections) {
        try {
          const existing = await collectionsRepo.findOne({ filter: { name: col.name } });
          if (existing) {
            let newFieldsCount = 0;
            let existingFieldsCount = 0;
            for (const field of col.fields || []) {
              const existingField = await fieldsRepo.findOne({ filter: { name: field.name, collectionName: col.name } });
              if (existingField) existingFieldsCount++;
              else newFieldsCount++;
            }
            validation.warnings.push({
              type: 'collection',
              name: String(col.name),
              message: `Collection exists. ${newFieldsCount} new field(s) will be added. ${existingFieldsCount} existing field(s) will be preserved.`,
            });
          }
        } catch {}
      }

      if (workflows.length > 0) {
        try {
          const workflowRepo = db.getRepository('workflows');
          for (const wf of workflows) {
            if (!wf.key && !wf.title) continue;
            
            // Check by key or title+type
            let existing = null;
            if (wf.key) {
              existing = await workflowRepo.findOne({ filter: { key: wf.key } });
            }
            if (!existing && wf.title && wf.type) {
              const matches = await workflowRepo.find({ 
                filter: { title: wf.title, type: wf.type } 
              });
              if (matches && matches.length > 0) existing = matches[0];
            }
            
            if (existing) {
              validation.warnings.push({ 
                type: 'workflow', 
                name: String(wf.title || wf.key), 
                message: 'Workflow already exists (will be updated if overwrite=true).' 
              });
            }
          }
        } catch {}
      }

      if (uiSchemas.length > 0) {
        try {
          const uiSchemaRepo = db.getRepository('uiSchemas');
          for (const schema of uiSchemas) {
            const uid = schema?.rootUid;
            if (!uid) continue;
            const existing = await uiSchemaRepo.findOne({ filter: { 'x-uid': uid } });
            if (existing) {
              validation.warnings.push({ 
                type: 'uiSchema', 
                name: String(uid), 
                message: 'UI Schema already exists (will be replaced if overwrite=true).' 
              });
            }
          }
        } catch {}
      }

      ctx.status = 200;
      ctx.type = 'application/json';
      ctx.body = { success: true, validation };
    } catch (err: any) {
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { success: false, message: String(err.message || 'Validation failed') };
    }
  }

  static async apply(ctx: Context) {
    const actionParams: any = (ctx as any).action?.params || {};
    const reqBody: any = (ctx.request as any).body || {};
    const importData: any =
      (actionParams.data && Object.keys(actionParams.data).length ? actionParams.data : undefined) ||
      (reqBody.data && Object.keys(reqBody.data).length ? reqBody.data : undefined) ||
      (Object.keys(reqBody).length ? reqBody : undefined) ||
      {};

    const db: any = (ctx as any).db;
    const app: any = (ctx as any).app;

    const overwrite: boolean = !!(importData?.options?.overwrite);

    const uiSchemasInput: any[] = Array.isArray(importData?.uiSchemas) ? importData.uiSchemas : [];
    const workflowsInput: any[] = Array.isArray(importData?.workflows) ? importData.workflows : [];
    const collectionsInput: any[] = Array.isArray(importData?.collections) ? importData.collections : [];

    const results: any = {
      collections: { synced: 0, rebuilt: 0, skipped: 0, errors: [] as any[] },
      workflows: { updated: 0, created: 0, nodesUpserted: 0, nodesDeleted: 0, errors: [] as any[] },
      uiSchemas: { updated: 0, created: 0, errors: [] as any[] },
    };

    try {
      try { if (app?.collectionManager?.reload) await app.collectionManager.reload(); } catch {}

      // Collections: light sync using runtime collection.sync (no dropping fields)
      try {
        const collectionsRepo = db.getRepository('collections');
        const fieldsRepo = db.getRepository('fields');
        for (const col of (collectionsInput || [])) {
          const name = typeof col === 'string' ? col : col?.name;
          if (!name) continue;
          let runtimeCol: any = null;
          try { runtimeCol = db.getCollection(name); } catch {}
          if (!runtimeCol) {
            try { if (app?.collectionManager?.reload) await app.collectionManager.reload(); } catch {}
            try { runtimeCol = db.getCollection(name); } catch {}
          }
          if (!runtimeCol) {
            const meta = await collectionsRepo.findOne({ filter: { name } }).catch(() => null);
            if (!meta) { results.collections.skipped++; continue; }
            const title = meta.get ? meta.get('title') || name : (meta.title || name);
            const primaryKey = meta.get ? meta.get('primaryKey') || 'id' : (meta.primaryKey || 'id');
            const fieldRows = await fieldsRepo.find({ filter: { collectionName: name } }).catch(() => []);
            const fields = (fieldRows || []).map((r: any) => {
              const row = r.get ? r.get() : r;
              const f: any = { name: row.name, type: row.type || 'string', interface: row.interface || 'input' };
              for (const k of Object.keys(row)) {
                if (['name','type','interface','collectionName'].includes(k)) continue;
                f[k] = row[k];
              }
              return f;
            });
            await db.import({ collections: [{ name, title, logging: true, autoGenId: true, createdBy: true, updatedBy: true, createdAt: true, updatedAt: true, sortable: true, primaryKey, fields }] });
            try { runtimeCol = db.getCollection(name); } catch {}
            if (!runtimeCol) continue;
            results.collections.rebuilt++;
          }
          await runtimeCol.sync({ force: false, alter: true });
          results.collections.synced++;
        }
      } catch (e: any) {
        results.collections.errors.push({ error: String(e?.message || e) });
      }

      // Workflows: update/create + nodes via flow_nodes:update/create and prune on overwrite
      if (workflowsInput.length) {
        try {
          const workflowRepo = db.getRepository('workflows');
          const flowNodeRepo = db.getRepository('flow_nodes');

          for (const wf of workflowsInput) {
            const wfKey = wf?.key || wf?.slug || wf?.id || wf?.name;
            if (!wfKey) continue;

            const existing = await workflowRepo.findOne({
              filter: { key: wfKey },
              appends: ['nodes'],
            }).catch(() => null);

            let workflowId: number;

            if (existing) {
              await workflowRepo.update({
                filterByTk: existing.get('id'),
                values: {
                  title: wf.title,
                  type: wf.type,
                  sync: !!wf.sync,
                  description: wf.description ?? null,
                  triggerTitle: wf.triggerTitle ?? null,
                  options: wf.options ?? {},
                  config: wf.config ?? {},
                },
              });
              workflowId = existing.get('id');
            } else {
              const created = await workflowRepo.create({
                values: {
                  title: wf.title,
                  type: wf.type,
                  key: wfKey,
                  sync: !!wf.sync,
                  description: wf.description ?? null,
                  triggerTitle: wf.triggerTitle ?? null,
                  options: wf.options ?? {},
                  config: wf.config ?? {},
                },
              });
              workflowId = created?.get ? created.get('id') : created.id;
              results.workflows.created++;
            }

            const nodesInput: any[] = Array.isArray(wf.nodes) ? wf.nodes : [];
            const keyToId = new Map<string, number>();
            const existingByKey = new Map<string, any>();

            try {
              const existingNodes = await flowNodeRepo.find({ filter: { workflowId } });
              for (const en of existingNodes || []) {
                const row = en.get ? en.get() : en;
                if (row.key) existingByKey.set(row.key, row);
              }
            } catch {}

            for (const n of nodesInput) {
              if (!n || !n.key) continue;
              const ex = existingByKey.get(n.key);
              if (ex) {
                await flowNodeRepo.update({
                  filterByTk: ex.id ?? ex.get?.('id'),
                  values: {
                    type: n.type ?? ex.type ?? null,
                    title: n.title ?? ex.title ?? null,
                    config: n.config ?? ex.config ?? {},
                    branchIndex: n.branchIndex ?? null,
                  },
                });
                keyToId.set(n.key, Number(ex.id ?? ex.get?.('id')));
              } else {
                const createdNode = await flowNodeRepo.create({
                  values: {
                    workflowId,
                    key: n.key,
                    type: n.type,
                    title: n.title ?? null,
                    config: n.config ?? {},
                    upstreamId: null,
                    downstreamId: null,
                    branchIndex: n.branchIndex ?? null,
                  },
                });
                const id = createdNode?.get ? createdNode.get('id') : createdNode.id;
                keyToId.set(n.key, Number(id));
              }
              results.workflows.nodesUpserted++;
            }

            if (overwrite) {
              try {
                const existingNodes = await flowNodeRepo.find({ filter: { workflowId } });
                const inputKeys = new Set(nodesInput.filter(x => x && x.key).map(x => x.key));
                for (const en of existingNodes || []) {
                  const row = en.get ? en.get() : en;
                  if (row.key && !inputKeys.has(row.key)) {
                    await flowNodeRepo.destroy({ filterByTk: row.id });
                    results.workflows.nodesDeleted++;
                  }
                }
              } catch {}
            }

            for (const n of nodesInput) {
              if (!n || !n.key) continue;
              const id = keyToId.get(n.key);
              if (!id) continue;
              const upstreamId = n.upstreamKey ? (keyToId.get(n.upstreamKey) ?? null) : null;
              const downstreamId = n.downstreamKey ? (keyToId.get(n.downstreamKey) ?? null) : null;
              await flowNodeRepo.update({
                filterByTk: id,
                values: {
                  upstreamId,
                  downstreamId,
                  branchIndex: n.branchIndex ?? null,
                },
              });
            }

            results.workflows.updated++;
          }
        } catch (e: any) {
          results.workflows.errors.push({ error: String(e?.message || e) });
        }
      }

      // uiSchema
      const uiBundles: any[] = uiSchemasInput;

      function pickChildren(schema: any): AnyObj[] {
        const props = (schema && schema.properties) || {};
        return Object.keys(props).map(k => props[k]).filter(Boolean);
      }
  
      const uiRepo = db.getRepository('ui_schemas');
      const treeRepo = db.getRepository('ui_schema_tree');
      async function insertAdjacent(targetUid: string, node: AnyObj): Promise<string> {
        const base: AnyObj = { ...node };
        delete base.properties;
        if (typeof (uiRepo as any).insertAdjacent === 'function') {
          const r = await (uiRepo as any).insertAdjacent({ target: targetUid, position: (node.position || 'beforeEnd'), schema: base, wrap: null });
          const ins = r?.get ? r.get() : r;
          const inserted = ins?.data || ins;
          const uid = inserted?.['x-uid'] || inserted?.xUid || inserted?.uid || base?.['x-uid'];
          const children = pickChildren(node);
          for (const child of children) {
            await insertAdjacent(uid, child);
          }
          return uid;
        } else {
          const created = await uiRepo.create({ values: { 'x-uid': base?.['x-uid'] || base?.uid || base?.name, name: base?.name || '', schema: base } });
          const uid = created?.get ? created.get('x-uid') : (created?.['x-uid'] || created?.uid || base?.['x-uid']);
          const ex0 = await treeRepo.findOne({ filter: { ancestor: uid, descendant: uid, depth: 0 } });
          if (!ex0) {
            await treeRepo.create({ values: { ancestor: uid, descendant: uid, depth: 0, async: false, type: null, sort: null } });
          }
          const children = pickChildren(node);
          for (const child of children) {
            await insertAdjacent(uid, child);
          }
          return uid;
        }
      }
  
      async function removeDescendants(rootUid: string) {
        const rows = await treeRepo.find({ filter: { ancestor: rootUid } }).catch(() => []);
        const list = (rows || []).map((r: any) => (r.get ? r.get() : r)).filter((x: AnyObj) => x.depth > 0);
        for (const row of list) {
          const uid = row.descendant;
          if (app?.schemaManager?.removeSchema) {
            try { await app.schemaManager.removeSchema(uid); } catch {}
          } else {
            try { await uiRepo.destroy({ filter: { 'x-uid': uid }, force: true }); } catch {}
            try { await treeRepo.destroy({ filter: { ancestor: uid }, force: true }); } catch {}
            try { await treeRepo.destroy({ filter: { descendant: uid }, force: true }); } catch {}
          }
        }
      }
  
      for (const bundle of uiBundles) {
        const incoming = bundle?.data;
        if (!incoming) continue;
        const name = incoming?.name;
        const type = incoming?.type;
        if (!name || !type) continue;

        let target = await uiRepo.findOne({ filter: { name, type } }).catch(() => null);
        if (!target) {
          const rootUid = incoming?.['x-uid'] || incoming?.uid || incoming?.schemaUid || incoming?.xUid || incoming?.name;
          const base: AnyObj = { ...incoming };
          delete base.properties;
          if (typeof (uiRepo as any).insert === 'function') {
            const r = await (uiRepo as any).insert(base);
            const ins = r?.get ? r.get() : r;
            const inserted = ins?.data || ins;
            const uid = inserted?.['x-uid'] || inserted?.xUid || inserted?.uid || base?.['x-uid'] || rootUid;
            const children = pickChildren(incoming);
            for (const child of children) {
              await insertAdjacent(uid, child);
            }
          } else {
            const created = await uiRepo.create({ values: { 'x-uid': rootUid, name: base?.name || '', schema: base } });
            const uid = created?.get ? created.get('x-uid') : (created?.['x-uid'] || created?.uid || rootUid);
            const ex0 = await treeRepo.findOne({ filter: { ancestor: uid, descendant: uid, depth: 0 } });
            if (!ex0) { await treeRepo.create({ values: { ancestor: uid, descendant: uid, depth: 0, async: false, type: null, sort: null } }); }
            const children = pickChildren(incoming);
            for (const child of children) {
              await insertAdjacent(uid, child);
            }
          }
          results.uiSchemas.created++;
          continue;
        }

        const rootUid = target.get ? target.get('x-uid') : (target['x-uid'] || target.uid);
        const base: AnyObj = { ...incoming };
        delete base.properties;

        await (uiRepo as any).update({ filterByTk: target.get ? target.get('id') : target.id, values: { schema: base, name } });

        await removeDescendants(rootUid);

        const children = pickChildren(incoming);
        for (const child of children) {
          await insertAdjacent(rootUid, child);
        }

        results.uiSchemas.merged++;
      }

      try { if (app?.collectionManager?.reload) await app.collectionManager.reload(); } catch {}
      try { if (app?.schemaManager?.reload) await app.schemaManager.reload(); } catch {}
      try { const wf = app?.pm?.get?.('workflow') || app?.workflow || app?.plugins?.workflow; if (wf?.engine?.reload) await wf.engine.reload(); if (wf?.reload) await wf.reload(); } catch {}

      (ctx as any).set && (ctx as any).set('X-Noco-Refresh', 'schema');

      ctx.status = 200;
      ctx.type = 'application/json';
      ctx.body = { success: true, results, message: 'Apply completed.', refresh: { schema: true, collections: true, workflows: true } };
    } catch (err: any) {
      ctx.status = 500;
      ctx.type = 'application/json';
      ctx.body = { success: false, message: String(err?.message || 'Apply failed') };
    }
  }
}