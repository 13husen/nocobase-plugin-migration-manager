import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Tabs, Button, Table, message, Upload, Space, Typography, Alert, Modal,
  Tag, Tooltip, Spin, Input
} from 'antd';
import {
  DownloadOutlined, UploadOutlined, DatabaseOutlined, BranchesOutlined,
  LayoutOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useRequest, useAPIClient } from '@nocobase/client';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Search } = Input;

function unwrap<T = any>(res: any): T {
  return (res?.data?.data ?? res?.data ?? res) as T;
}

function prettifyCollectionTitle(title: string) {
  if (!title) return '';
  return title.replace(/\{\{t\("(.+?)"\)\}\}/g, '$1').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type ItemsShape = { collections: any[]; workflows: any[]; uiSchemas: any[]; };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const MigrationPage: React.FC = () => {
  const api = useAPIClient();
  const [activeTab, setActiveTab] = useState('export');
  const [availableItems, setAvailableItems] = useState<ItemsShape>({ collections: [], workflows: [], uiSchemas: [] });

  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedWorkflows, setSelectedWorkflows] = useState<(string | number)[]>([]);
  const [selectedSchemas, setSelectedSchemas] = useState<string[]>([]);

  const [restarting, setRestarting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastImportPayload, setLastImportPayload] = useState<any | null>(null);
  const [lastWasPreview, setLastWasPreview] = useState(false);

  const [collectionQuery, setCollectionQuery] = useState('');
  const [workflowQuery, setWorkflowQuery] = useState('');
  const [schemaQuery, setSchemaQuery] = useState('');

  const [collectionPage, setCollectionPage] = useState({ current: 1, pageSize: 10 });
  const [workflowPage, setWorkflowPage] = useState({ current: 1, pageSize: 10 });
  const [schemaPage, setSchemaPage] = useState({ current: 1, pageSize: 10 });

  useEffect(() => {
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (restarting || applying) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => window.removeEventListener('beforeunload', beforeUnloadHandler);
  }, [restarting, applying]);

  const { run: fetchItems, loading: loadingItems } = useRequest(
    { url: 'migration:list', method: 'get' },
    {
      manual: false,
      onSuccess: (res) => {
        const payload = unwrap<ItemsShape>(res);
        setAvailableItems({
          collections: payload?.collections ?? [],
          workflows: payload?.workflows ?? [],
          uiSchemas: payload?.uiSchemas ?? [],
        });
      },
      onError: () => setAvailableItems({ collections: [], workflows: [], uiSchemas: [] }),
    }
  );

  const { run: exportData, loading: exporting } = useRequest(
    { url: 'migration:export', method: 'post' },
    {
      manual: true,
      onSuccess: (res) => {
        const payload = unwrap(res);
        const hasData =
          (payload?.collections?.length > 0) ||
          (payload?.workflows?.length > 0) ||
          (payload?.uiSchemas?.length > 0) ||
          (payload?.desktopRoutes?.length > 0);
        if (!hasData) {
          message.warning('Export succeeded but no data.');
          return;
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nocobase-migration-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        message.success(
          `Export successful! ${payload.collections?.length || 0} collections, ${payload.workflows?.length || 0} workflows, ${payload.uiSchemas?.length || 0} UI schemas, ${payload.desktopRoutes?.length || 0} routes`
        );
      },
      onError: (error) => message.error(`Export failed: ${error.message}`),
    }
  );
  

  const triggerRestart = async (silentWaitMs = 10000, extraWaitMs = 2000) => {
    setRestarting(true);
    try {
      await api.request({ url: 'app:restart', method: 'post', timeout: 60000 });
      await delay(silentWaitMs);
      await delay(extraWaitMs);
    } finally {
      setRestarting(false);
    }
  };

  const applyWithRetry = async (collectionsPayload: any, attempts = 15, intervalMs = 1500) => {
    let lastErr: any = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await api.request({
          url: 'migration:apply',
          method: 'post',
          data: { data: { collections: collectionsPayload } },
          headers: { 'Content-Type': 'application/json' },
          timeout: 600000,
        });
        return unwrap<any>(res);
      } catch (e: any) {
        lastErr = e;
        if (e?.response?.status === 503 || String(e?.message || '').includes('APP_COMMANDING')) {
          await delay(intervalMs);
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('Apply failed after several attempts.');
  };

  const { run: runImport, loading: importing } = useRequest(
    (payloadWithOptions: any) =>
      api.request({
        url: 'migration:import',
        method: 'post',
        data: { data: payloadWithOptions },
        headers: { 'Content-Type': 'application/json' },
        timeout: 600000,
      }) as any,
    {
      manual: true,
      onSuccess: async (res) => {
        const data = unwrap<any>(res);
        const { needsConfirmation, results } = data || {};

        if (needsConfirmation) {
          const conflicts: any[] = results?.collections?.conflicts || [];
          Modal.confirm({
            title: 'Confirm Potentially Data-Altering Changes',
            icon: <ExclamationCircleOutlined />,
            width: 760,
            okText: 'Proceed & Override',
            cancelText: 'Cancel',
            content: (
              <div>
                <Alert type="warning" showIcon message="Conflicts were found on existing fields." style={{ marginBottom: 12 }} />
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey={(r) => `${r.collection}.${r.field}`}
                    dataSource={conflicts}
                    columns={[
                      { title: 'Collection', dataIndex: 'collection' },
                      { title: 'Field', dataIndex: 'field' },
                      { title: 'Current', render: (_: any, r: any) => `type=${r.current.type}, interface=${r.current.interface}, unique=${String(r.current.unique)}, allowNull=${String(r.current.allowNull)}, pk=${String(r.current.primaryKey)}` },
                      { title: 'Incoming', render: (_: any, r: any) => `type=${r.incoming.type}, interface=${r.incoming.interface}, unique=${String(r.incoming.unique)}, allowNull=${String(r.incoming.allowNull)}, pk=${String(r.incoming.primaryKey)}` },
                    ]}
                  />
                </div>
              </div>
            ),
            onOk: () => {
              if (!lastImportPayload) return;
              setLastWasPreview(false);
              runImport({ ...lastImportPayload, options: { forceOverride: true } });
            },
          });
          return;
        }

        if (lastWasPreview && lastImportPayload) {
          setLastWasPreview(false);
          runImport(lastImportPayload);
          return;
        }

        const r = results || {};
        Modal.success({
          title: 'Import Successful',
          content: (
            <div>
              <p>Collections: {r.collections?.success || 0} succeeded, {r.collections?.failed || 0} failed</p>
              <p>Workflows: {r.workflows?.success || 0} succeeded, {r.workflows?.failed || 0} failed</p>
              <p>UI Schemas: {r.uiSchemas?.success || 0} succeeded, {r.uiSchemas?.failed || 0} failed</p>
              {(r.collections?.errors?.length > 0 || r.workflows?.errors?.length > 0 || r.uiSchemas?.errors?.length > 0) && (
                <Alert
                  message="Some errors occurred"
                  description={
                    <ul>
                      {[...(r.collections?.errors || []), ...(r.workflows?.errors || []), ...(r.uiSchemas?.errors || [])].map((err: any, idx: number) => (
                        <li key={idx}>{err.error || String(err)}</li>
                      ))}
                    </ul>
                  }
                  type="warning"
                  style={{ marginTop: 10 }}
                />
              )}
            </div>
          ),
          okText: 'Continue',
          onOk: async () => {
            try {
              setApplying(true);
              await triggerRestart(12000, 2000);
              const collectionsPayload = (lastImportPayload?.collections || []).map((c: any) =>
                typeof c === 'string' ? { name: c } : c
              );
              const applyData = await applyWithRetry(collectionsPayload, 15, 1500);

              Modal.success({
                title: 'Apply Complete',
                content: (
                  <div>
                  <p>The changes have been successfully applied. Click <strong>Continue</strong> to refresh the page for the changes to take effect.</p>
                    {(applyData?.results?.errors?.length > 0) && (
                      <Alert
                        type="warning"
                        message="Errors occurred during apply"
                        description={
                          <ul style={{ marginBottom: 0 }}>
                            {(applyData?.results?.errors || []).map((e: any, i: number) => (
                              <li key={i}>
                                {(e.collection || e.route || e.schema || 'item')}: {e.error}
                              </li>
                            ))}
                          </ul>
                        }
                      />
                    )}
                  </div>
                ),
                okText: 'Continue',
                onOk: () => {
                  window.location.reload();
                },
              });
            } catch (e: any) {
              message.error(e?.message || 'Apply failed');
            } finally {
              setApplying(false);
              setLastImportPayload(null);
              fetchItems();
            }
          },
        });
        fetchItems();
      },
      onError: (error) => message.error(`Import failed: ${error.message}`),
    }
  );

  const handleExport = () => {
    if (!selectedCollections.length && !selectedWorkflows.length && !selectedSchemas.length) {
      message.warning('Select at least one item to export');
      return;
    }
    Modal.confirm({
      title: 'Export Confirmation',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>You will export:</p>
          <ul>
            <li>{selectedCollections.length} Collections</li>
            <li>{selectedWorkflows.length} Workflows</li>
            <li>{selectedSchemas.length} UI Schemas/Routes</li>
          </ul>
          <Alert message="Note" description="Export includes collection structure, workflow config, UI schema subtree, and desktop routes." type="info" style={{ marginTop: 10 }} />
        </div>
      ),
      onOk: () => {
        exportData({
          data: {
            collections: selectedCollections,
            workflows: selectedWorkflows,
            uiSchemas: [],
            desktopRoutes: selectedSchemas,
          },
        });
      },
    });
  };
  

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const payload = JSON.parse(e.target?.result as string);
        setLastImportPayload(payload);
        setLastWasPreview(true);
        Modal.confirm({
          title: 'Import Confirmation',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p>The file will import:</p>
              <ul>
                <li>{payload.collections?.length || 0} Collections</li>
                <li>{payload.workflows?.length || 0} Workflows</li>
                <li>{payload.uiSchemas?.length || 0} UI Schemas</li>
              </ul>
              <Alert message="Warning" description="The first step will run a PREVIEW. If safe, the process will proceed automatically." type="warning" style={{ marginTop: 10 }} />
            </div>
          ),
          onOk: () => runImport({ ...payload, options: { preview: true } }),
        });
      } catch {
        message.error('Invalid or corrupt file');
      }
    };
    reader.readAsText(file);
    return false;
  };

  const filteredCollections = useMemo(() => {
    const q = collectionQuery.trim().toLowerCase();
    const arr = (availableItems.collections || []).filter((c: any) =>
      (c.title || c.name || '').toLowerCase().includes(q)
    );
    return { total: arr.length, data: arr };
  }, [availableItems.collections, collectionQuery]);

  const pagedCollections = useMemo(() => {
    const start = (collectionPage.current - 1) * collectionPage.pageSize;
    return filteredCollections.data.slice(start, start + collectionPage.pageSize);
  }, [filteredCollections, collectionPage]);

  const filteredWorkflows = useMemo(() => {
    const q = workflowQuery.trim().toLowerCase();
    const arr = (availableItems.workflows || []).filter((w: any) =>
      (w.title || '').toLowerCase().includes(q)
    );
    return { total: arr.length, data: arr };
  }, [availableItems.workflows, workflowQuery]);

  const pagedWorkflows = useMemo(() => {
    const start = (workflowPage.current - 1) * workflowPage.pageSize;
    return filteredWorkflows.data.slice(start, start + workflowPage.pageSize);
  }, [filteredWorkflows, workflowPage]);

  const filteredSchemas = useMemo(() => {
    const q = schemaQuery.trim().toLowerCase();
    const arr = (availableItems.uiSchemas || []).filter((s: any) =>
      ((s.displayTitle || s.title || s.name || '') as string).toLowerCase().includes(q)
    );
    return { total: arr.length, data: arr };
  }, [availableItems.uiSchemas, schemaQuery]);

  const pagedSchemas = useMemo(() => {
    const start = (schemaPage.current - 1) * schemaPage.pageSize;
    return filteredSchemas.data.slice(start, start + schemaPage.pageSize);
  }, [filteredSchemas, schemaPage]);

  return (
    <div style={{ padding: 24, position: 'relative' }}>
      <Card>
        <Title level={2}>Migration Manager</Title>
        <Text type="secondary">Export and import collections, workflows, and UI schemas across NocoBase instances</Text>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Export" key="export">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Card title={<Space><DatabaseOutlined />Collections</Space>} size="small">
                <div style={{ marginBottom: 12 }}>
                  <Search
                    allowClear
                    placeholder="Filter by Title"
                    onSearch={(v) => { setCollectionQuery(v); setCollectionPage({ ...collectionPage, current: 1 }); }}
                    onChange={(e) => { setCollectionQuery(e.target.value); setCollectionPage({ ...collectionPage, current: 1 }); }}
                    value={collectionQuery}
                    style={{ maxWidth: 320 }}
                  />
                </div>
                <Table
                  rowSelection={{ selectedRowKeys: selectedCollections, onChange: (keys) => setSelectedCollections(keys as string[]) }}
                  columns={[
                    { title: 'Name', dataIndex: 'name', key: 'name' },
                    { title: 'Title', dataIndex: 'title', key: 'title', render: prettifyCollectionTitle },
                    { title: 'Fields', dataIndex: 'fields', key: 'fields' },
                  ]}
                  dataSource={pagedCollections}
                  rowKey="name"
                  loading={loadingItems}
                  pagination={{
                    current: collectionPage.current,
                    pageSize: collectionPage.pageSize,
                    total: filteredCollections.total,
                    showSizeChanger: true,
                    onChange: (current, pageSize) => setCollectionPage({ current, pageSize }),
                  }}
                  size="small"
                />
              </Card>

              <Card title={<Space><BranchesOutlined />Workflows</Space>} size="small">
                <div style={{ marginBottom: 12 }}>
                  <Search
                    allowClear
                    placeholder="Filter by Title"
                    onSearch={(v) => { setWorkflowQuery(v); setWorkflowPage({ ...workflowPage, current: 1 }); }}
                    onChange={(e) => { setWorkflowQuery(e.target.value); setWorkflowPage({ ...workflowPage, current: 1 }); }}
                    value={workflowQuery}
                    style={{ maxWidth: 320 }}
                  />
                </div>
                <Table
                  rowSelection={{ selectedRowKeys: selectedWorkflows, onChange: (keys) => setSelectedWorkflows(keys as (string | number)[]) }}
                  columns={[
                    { title: 'Title', dataIndex: 'title', key: 'title' },
                    { title: 'Key', dataIndex: 'key', key: 'key' },
                    { title: 'Status', dataIndex: 'enabled', key: 'enabled', render: (v: boolean) => (v ? 'Enabled' : 'Disabled') },
                  ]}
                  dataSource={pagedWorkflows}
                  rowKey="id"
                  loading={loadingItems}
                  pagination={{
                    current: workflowPage.current,
                    pageSize: workflowPage.pageSize,
                    total: filteredWorkflows.total,
                    showSizeChanger: true,
                    onChange: (current, pageSize) => setWorkflowPage({ current, pageSize }),
                  }}
                  size="small"
                />
              </Card>

              <Card title={<Space><LayoutOutlined />UI Schemas</Space>} size="small">
                <div style={{ marginBottom: 12 }}>
                  <Search
                    allowClear
                    placeholder="Filter by Title"
                    onSearch={(v) => { setSchemaQuery(v); setSchemaPage({ ...schemaPage, current: 1 }); }}
                    onChange={(e) => { setSchemaQuery(e.target.value); setSchemaPage({ ...schemaPage, current: 1 }); }}
                    value={schemaQuery}
                    style={{ maxWidth: 320 }}
                  />
                </div>
                <Table
                  rowSelection={{ selectedRowKeys: selectedSchemas, onChange: (keys) => setSelectedSchemas(keys as string[]) }}
                  columns={[
                    {
                      title: 'Menu / Page',
                      dataIndex: 'displayTitle',
                      key: 'displayTitle',
                      render: (_: any, record: any) => (
                        <Space>
                          <Text>{record?.displayTitle || record?.title || record?.name || 'Untitled'}</Text>
                          <Tag>{record?.type}</Tag>
                        </Space>
                      ),
                    },
                    { title: 'UID', dataIndex: 'schemaUid', key: 'schemaUid' },
                  ]}
                  dataSource={pagedSchemas}
                  rowKey="schemaUid"
                  loading={loadingItems}
                  pagination={{
                    current: schemaPage.current,
                    pageSize: schemaPage.pageSize,
                    total: filteredSchemas.total,
                    showSizeChanger: true,
                    onChange: (current, pageSize) => setSchemaPage({ current, pageSize }),
                  }}
                  size="small"
                />
              </Card>

              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleExport}
                loading={exporting}
                size="large"
                disabled={restarting || applying}
              >
                Export Selected Items
              </Button>
            </Space>
          </TabPane>

          <TabPane tab="Import" key="import">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Alert
                message="Import from Development to Production"
                description={
                  <div>
                    <p>Upload the exported JSON file from the development server.</p>
                    <p><strong>What will be imported:</strong></p>
                    <ul>
                      <li>Collection structure (without data)</li>
                      <li>Workflow configuration</li>
                      <li>UI Schema/Page design</li>
                    </ul>
                    <p><strong>What will NOT be affected:</strong></p>
                    <ul>
                      <li>Data within collections</li>
                      <li>Collections not present in the import file</li>
                    </ul>
                  </div>
                }
                type="info"
              />

              <Upload accept=".json" beforeUpload={handleImport} showUploadList={false} disabled={restarting || applying}>
                <Button type="primary" icon={<UploadOutlined />} loading={importing} size="large" disabled={restarting || applying}>
                  Upload Migration File (.json)
                </Button>
              </Upload>
            </Space>
          </TabPane>
        </Tabs>
      </Card>

      {(restarting || applying) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(255,255,255,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <Spin size="large" tip={restarting ? 'Restarting...' : 'Applying...'} />
        </div>
      )}
    </div>
  );
};