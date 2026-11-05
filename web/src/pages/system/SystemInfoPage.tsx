import { useMemo } from 'react';
import { Alert, Button, Col, Descriptions, Row, Skeleton, Tag } from 'antd';
import { CloudServerOutlined, DatabaseOutlined, ReloadOutlined, AppstoreOutlined, NodeIndexOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useMeta } from '../../store/meta';
import { fmtDateTime, fmtNumber } from '../../utils/format';

const TABLE_LABELS: Record<string, string> = {
  users: '用户', roles: '角色', customers: '客户', suppliers: '供应商', items: '物料',
  employees: '员工', departments: '部门', documents: '业务单据', documentLines: '单据明细',
  workOrders: '生产工单', vouchers: '会计凭证', invoices: '发票', payments: '收付款',
  stockLedger: '库存流水', leads: '销售线索', opportunities: '商机', contracts: '合同',
  attendances: '考勤记录', payrolls: '薪资记录', leaveRequests: '请假申请', notices: '通知公告',
  auditLogs: '审计日志',
};

function fmtUptime(seconds?: number): string {
  const s = Number(seconds) || 0;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} 天 ${h} 小时 ${m} 分`;
  if (h > 0) return `${h} 小时 ${m} 分 ${sec} 秒`;
  return `${m} 分 ${sec} 秒`;
}

export default function SystemInfoPage() {
  const { meta } = useMeta();
  const info = useRequest(() => api.get('/api/system/info'), []);
  const data = info.data || {};
  const app = data.app || {};
  const node = data.node || {};
  const server = data.server || {};
  const database = data.database || {};
  const memory = data.memory || {};
  const counts = data.counts || {};

  const countRows = useMemo(
    () => Object.entries(counts).map(([key, value]) => ({
      key,
      label: TABLE_LABELS[key] || key,
      value: Number(value) || 0,
    })),
    [counts],
  );
  const totalRows = useMemo(() => countRows.reduce((s, r) => s + r.value, 0), [countRows]);

  const dbFileName = useMemo(() => {
    const file = String(database.file || '');
    return file.split(/[\\/]/).pop() || file;
  }, [database.file]);

  if (info.loading && !info.data) {
    return (
      <div>
        <PageHeader title="系统信息" subtitle="系统版本、运行环境、数据库与各表数据量统计" />
        <div className="card"><div className="card-pad"><Skeleton active paragraph={{ rows: 8 }} /></div></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="系统信息"
        subtitle="系统版本、运行环境、数据库与各表数据量统计（仅系统管理员可查看）"
        extra={<Button icon={<ReloadOutlined />} loading={info.loading} onClick={info.refresh}>刷新</Button>}
      />

      {info.error && <Alert type="error" showIcon style={{ marginBottom: 12 }} message="系统信息加载失败" description={info.error} />}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label"><CloudServerOutlined style={{ color: 'var(--primary)' }} />应用版本</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{app.name || '云枢ERP'}<small style={{ marginLeft: 8 }}>V{app.version || '-'}</small></div>
          <div className="kpi-foot">{app.edition || '社区版'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><NodeIndexOutlined style={{ color: 'var(--primary)' }} />Node 运行时</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{node.version || '-'}</div>
          <div className="kpi-foot">{node.platform || '-'} / {node.arch || '-'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><DatabaseOutlined style={{ color: 'var(--primary)' }} />数据库大小</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{fmtNumber(database.sizeMb || 0, 2)} <small>MB</small></div>
          <div className="kpi-foot">{dbFileName || '-'} · {database.journalMode || '-'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label"><AppstoreOutlined style={{ color: 'var(--primary)' }} />数据总量</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>{fmtNumber(totalRows, 0)} <small>条</small></div>
          <div className="kpi-foot">{countRows.length} 张业务表</div>
        </div>
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={12}>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-head">
              <div className="card-title"><span className="dot" />运行环境</div>
            </div>
            <div className="card-pad">
              <Descriptions
                column={1}
                size="small"
                bordered
                items={[
                  { key: 'app', label: '应用名称', children: `${app.name || '-'} ${app.version ? `V${app.version}` : ''}` },
                  { key: 'edition', label: '版本类型', children: app.edition || '-' },
                  { key: 'node', label: 'Node 版本', children: node.version || '-' },
                  { key: 'platform', label: '操作系统', children: `${node.platform || '-'} / ${node.arch || '-'}` },
                  { key: 'pid', label: '进程 PID', children: node.pid || '-' },
                  { key: 'port', label: '服务端口', children: server.port || '-' },
                  { key: 'tz', label: '时区', children: server.timezone || '-' },
                  { key: 'uptime', label: '运行时长', children: fmtUptime(server.uptime) },
                  { key: 'startedAt', label: '启动时间', children: server.startedAt ? new Date(server.startedAt).toLocaleString('zh-CN') : '-' },
                  { key: 'serverTime', label: '服务器时间', children: server.time ? new Date(server.time).toLocaleString('zh-CN') : '-' },
                ]}
              />
            </div>
          </div>
        </Col>
        <Col xs={24} xl={12}>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-head">
              <div className="card-title"><span className="dot" />数据库与内存</div>
            </div>
            <div className="card-pad">
              <Descriptions
                column={1}
                size="small"
                bordered
                items={[
                  { key: 'file', label: '数据库文件', children: <span style={{ wordBreak: 'break-all', fontSize: 12 }}>{database.file || '-'}</span> },
                  { key: 'size', label: '文件大小', children: `${fmtNumber(database.size || 0, 0)} 字节（${fmtNumber(database.sizeMb || 0, 2)} MB）` },
                  { key: 'journal', label: '日志模式', children: database.journalMode || '-' },
                  { key: 'rss', label: '常驻内存 RSS', children: `${fmtNumber(memory.rssMb || 0, 2)} MB` },
                  { key: 'heap', label: '堆内存使用', children: `${fmtNumber(memory.heapUsedMb || 0, 2)} MB` },
                  { key: 'user', label: '当前用户', children: data.currentUser ? `${data.currentUser.name}（${data.currentUser.roleName || '-'}）` : '-' },
                  { key: 'lastLogin', label: '最后登录', children: data.currentUser?.lastLoginAt ? fmtDateTime(data.currentUser.lastLoginAt) : '-' },
                  { key: 'employee', label: '关联员工', children: data.currentUser?.employeeId ? `员工 #${data.currentUser.employeeId}` : '未关联' },
                ]}
              />
            </div>
          </div>
        </Col>
      </Row>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />各表数据量统计</div>
          <span className="text-muted" style={{ fontSize: 12 }}>共 {countRows.length} 张表 · 合计 {fmtNumber(totalRows, 0)} 条记录</span>
        </div>
        <div className="card-pad">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {countRows.map((r) => (
              <div key={r.key} style={{ padding: '10px 12px', background: '#f8fafd', borderRadius: 8 }}>
                <div className="text-muted" style={{ fontSize: 12 }}>{r.label}</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 650, marginTop: 2 }}>
                  {fmtNumber(r.value, 0)}
                  <span className="text-muted" style={{ fontSize: 11, fontWeight: 400, marginLeft: 3 }}>条</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />功能模块清单</div>
          <span className="text-muted" style={{ fontSize: 12 }}>权限矩阵中可选模块 × 动作</span>
        </div>
        <div className="card-pad">
          <div style={{ marginBottom: 12 }}>
            <span className="text-muted" style={{ fontSize: 12, marginRight: 8 }}>业务模块：</span>
            {(meta?.modules || []).map((m: any) => (
              <Tag key={m.key} color="blue" style={{ marginBottom: 6 }}>{m.name}<span style={{ opacity: 0.65, marginLeft: 4 }}>{m.key}</span></Tag>
            ))}
          </div>
          <div>
            <span className="text-muted" style={{ fontSize: 12, marginRight: 8 }}>操作动作：</span>
            {(meta?.actions || []).map((a: any) => (
              <Tag key={a.key} style={{ marginBottom: 6 }}>{a.name}<span style={{ opacity: 0.65, marginLeft: 4 }}>{a.key}</span></Tag>
            ))}
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
            模块数 {(meta?.modules || []).length} 个 · 动作数 {(meta?.actions || []).length} 个 · 权限码组合 {(meta?.modules || []).length * (meta?.actions || []).length} 个
          </div>
        </div>
      </div>

      <div className="text-muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 16 }}>
        云枢ERP V{app.version || '1.0.0'} · 数据目录 {dbFileName || '-'} · 技术支持：云枢科技
      </div>
    </div>
  );
}
