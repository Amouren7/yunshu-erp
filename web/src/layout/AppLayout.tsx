import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { Avatar, Badge, Button, Dropdown, Input, Layout, Modal, Popover, Space, Tag, Tooltip, message } from 'antd';
import {
  BellOutlined, CloseOutlined, DownOutlined, FullscreenOutlined, LockOutlined, LogoutOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, ReloadOutlined, SearchOutlined, SettingOutlined, UserOutlined,
} from '@ant-design/icons';
import { appModules, findRoute, groupOfPath } from '../router/registry';
import { menuIcon } from './icons';
import { useAuth } from '../store/auth';
import { useMeta } from '../store/meta';
import { api } from '../api/client';

interface TabItem { path: string; label: string; closable?: boolean }

const HOME_PATH = '/dashboard';

export default function AppLayout() {
  const { user, logout, hasPerm } = useAuth();
  const { meta } = useMeta();
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('erp_sidebar') === '1');
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notices, setNotices] = useState<any[]>([]);
  const [noticeOpen, setNoticeOpen] = useState(false);

  // 菜单可见性
  const groups = useMemo(() => {
    return appModules
      .map((m) => {
        const routes = m.routes.filter((r) => !r.hidden).filter((r) => hasPerm(r.perm));
        return { ...m.group, routes };
      })
      .filter((g) => g.routes.length > 0);
  }, [hasPerm]);

  const currentRoute = findRoute(location.pathname);
  const currentGroup = groupOfPath(location.pathname);
  const activeKey = currentRoute?.path === location.pathname ? location.pathname : (findRoute(location.pathname)?.path || location.pathname);

  // 标签页同步
  useEffect(() => {
    const path = location.pathname;
    if (path === '/login') return;
    const route = findRoute(path);
    const label = route?.label || (path.includes('/new') ? '新建' : '详情');
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) {
        return prev.map((t) => (t.path === path ? { ...t, label } : t));
      }
      return [...prev, { path, label, closable: path !== HOME_PATH }];
    });
  }, [location.pathname]);

  useEffect(() => {
    if (!tabs.length && location.pathname !== '/login') {
      setTabs([{ path: HOME_PATH, label: '工作台', closable: false }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.get<any>('/api/system/notices').then((res) => {
      const rows = Array.isArray(res) ? res : res?.rows || [];
      setNotices(rows.filter((n: any) => !n.is_read).slice(0, 8));
    }).catch(() => {});
  }, []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      localStorage.setItem('erp_sidebar', c ? '0' : '1');
      return !c;
    });
  };

  const closeTab = (path: string) => {
    const idx = tabs.findIndex((t) => t.path === path);
    const next = tabs.filter((t) => t.path !== path);
    setTabs(next);
    if (location.pathname === path) {
      const target = next[Math.max(0, idx - 1)]?.path || HOME_PATH;
      navigate(target);
    }
  };

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
      { key: 'password', icon: <LockOutlined />, label: '修改密码' },
      { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }: any) => {
      if (key === 'logout') logout();
      if (key === 'profile') navigate('/system/profile');
      if (key === 'password') navigate('/system/profile?tab=password');
      if (key === 'settings') navigate('/system/settings');
    },
  };

  const noticesContent = (
    <div style={{ width: 320 }}>
      {notices.length === 0 && <div className="empty-hint" style={{ padding: 20 }}>暂无未读通知</div>}
      {notices.map((n) => (
        <div key={n.id} style={{ padding: '10px 4px', borderBottom: '1px solid #f0f2f7' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Tag color={n.level === 'DANGER' ? 'red' : n.level === 'WARN' ? 'orange' : 'blue'} style={{ marginInlineEnd: 0 }}>
              {n.level === 'DANGER' ? '预警' : n.level === 'WARN' ? '提醒' : '通知'}
            </Tag>
            <b style={{ fontSize: 12.5 }}>{n.title}</b>
          </div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>{n.content}</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>{n.created_at}</div>
        </div>
      ))}
      <div style={{ textAlign: 'center', paddingTop: 10 }}>
        <Button size="small" type="link" onClick={() => { setNoticeOpen(false); navigate('/system/notices'); }}>查看全部</Button>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">云</div>
          {!collapsed && (
            <div className="sidebar-logo-text">
              <b>云枢ERP</b>
              <span>YUNSHU ERP</span>
            </div>
          )}
        </div>
        <nav className="sidebar-menu">
          {groups.map((g) => (
            <div key={g.key}>
              {!collapsed && <div className="menu-group-title">{g.label}</div>}
              {collapsed && <div style={{ height: 8 }} />}
              {g.routes.map((r) => {
                const active = activeKey === r.path || location.pathname === r.path;
                return (
                  <Tooltip key={r.path} title={collapsed ? r.label : ''} placement="right">
                    <div className={`menu-item ${active ? 'active' : ''}`} onClick={() => navigate(r.path)}>
                      {menuIcon(r.icon)}
                      {!collapsed && <span className="menu-item-label">{r.label}</span>}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-foot">
            <div>V1.0.0 · {meta?.app?.company || '云枢科技'}</div>
            <div style={{ marginTop: 3 }}>© 2026 云枢ERP</div>
          </div>
        )}
      </aside>

      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-collapse" onClick={toggleCollapse}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
          <div className="topbar-breadcrumb">
            {currentGroup?.label || '工作台'} <span style={{ margin: '0 6px', color: '#c3ccdb' }}>/</span>
            <b>{currentRoute?.label || '工作台'}</b>
          </div>
          <div className="topbar-spacer" />
          <div className="topbar-search" onClick={() => setSearchOpen(true)}>
            <SearchOutlined />
            <span style={{ fontSize: 12 }}>搜索单据、客户、物料…</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, border: '1px solid #e4e9f2', borderRadius: 4, padding: '0 4px' }}>Ctrl K</span>
          </div>
          <Tooltip title="刷新页面">
            <div className="topbar-icon" onClick={() => location.reload()}><ReloadOutlined /></div>
          </Tooltip>
          <Tooltip title="全屏">
            <div className="topbar-icon" onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen().catch(() => {});
            }}><FullscreenOutlined /></div>
          </Tooltip>
          <Popover
            trigger="click"
            open={noticeOpen}
            onOpenChange={setNoticeOpen}
            content={noticesContent}
            title={<span style={{ fontSize: 13 }}>消息通知</span>}
            placement="bottomRight"
          >
            <div className="topbar-icon"><Badge count={notices.length} size="small"><BellOutlined /></Badge></div>
          </Popover>
          <div style={{ width: 1, height: 22, background: '#eef1f7' }} />
          <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
            <div className="topbar-user">
              <Avatar size={30} style={{ background: 'linear-gradient(135deg,#4d8bff,#2f6bff)', fontSize: 13 }}>
                {user?.name?.slice(0, 1) || 'U'}
              </Avatar>
              <div>
                <div className="topbar-user-name">{user?.name}</div>
                <div className="topbar-user-role">{user?.roleName} <DownOutlined style={{ fontSize: 8 }} /></div>
              </div>
            </div>
          </Dropdown>
        </header>

        <div className="tabs-bar">
          {tabs.map((t) => (
            <div
              key={t.path}
              className={`tab-item ${location.pathname === t.path ? 'active' : ''}`}
              onClick={() => navigate(t.path)}
            >
              <span>{t.label}</span>
              {t.closable && (
                <span className="tab-close" onClick={(e) => { e.stopPropagation(); closeTab(t.path); }}>
                  <CloseOutlined />
                </span>
              )}
            </div>
          ))}
        </div>

        <main className="content-scroll">
          <div className="page">{outlet}</div>
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} navigate={navigate} />
    </div>
  );
}

function GlobalSearch({ open, onClose, navigate }: { open: boolean; onClose: () => void; navigate: (p: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (!open) { setKeyword(''); setResult(null); }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); (document.querySelector('#global-search-input input') as any)?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const doSearch = (kw: string) => {
    setKeyword(kw);
    if (timer.current) clearTimeout(timer.current);
    if (!kw.trim()) { setResult(null); return; }
    timer.current = setTimeout(() => {
      setLoading(true);
      api.get('/api/search', { q: kw }).then(setResult).catch(() => setResult(null)).finally(() => setLoading(false));
    }, 260);
  };

  const groups = result ? [
    { title: '业务单据', items: result.documents || [], render: (x: any) => ({ label: `${x.doc_no} · ${x.partner_name || ''}`, extra: x.doc_type_name, path: x.path }) },
    { title: '客户', items: result.customers || [], render: (x: any) => ({ label: `${x.code} ${x.name}`, extra: x.phone || '', path: '/basedata/customers' }) },
    { title: '供应商', items: result.suppliers || [], render: (x: any) => ({ label: `${x.code} ${x.name}`, extra: x.phone || '', path: '/basedata/suppliers' }) },
    { title: '物料', items: result.items || [], render: (x: any) => ({ label: `${x.code} ${x.name}`, extra: x.spec || '', path: '/basedata/items' }) },
  ].filter((g) => g.items.length > 0) : [];

  return (
    <Modal open={open} onCancel={onClose} footer={null} width={640} destroyOnClose title={null} styles={{ body: { padding: 0 } }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef1f7' }}>
        <Input
          id="global-search-input"
          autoFocus
          size="large"
          allowClear
          prefix={<SearchOutlined style={{ color: '#8b98ab' }} />}
          placeholder="输入单据号 / 客户 / 供应商 / 物料编码或名称"
          value={keyword}
          onChange={(e) => doSearch(e.target.value)}
          variant="borderless"
        />
      </div>
      <div style={{ maxHeight: 460, overflowY: 'auto', padding: '6px 8px 12px' }}>
        {!keyword && (
          <div className="empty-hint">
            <div style={{ marginBottom: 8 }}>全局搜索（Ctrl + K 唤起）</div>
            <div style={{ fontSize: 12 }}>支持销售/采购/库存单据号、客户、供应商、物料</div>
          </div>
        )}
        {keyword && !loading && groups.length === 0 && <div className="empty-hint">未找到「{keyword}」的相关结果</div>}
        {groups.map((g) => (
          <div key={g.title}>
            <div className="text-muted" style={{ fontSize: 11, padding: '8px 10px 4px', letterSpacing: 1 }}>{g.title}</div>
            {g.items.slice(0, 6).map((x: any, i: number) => {
              const item = g.render(x);
              return (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f6f9ff')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => { onClose(); navigate(item.path); }}
                >
                  <span style={{ flex: 1, fontSize: 13 }}>{item.label}</span>
                  <span className="text-muted" style={{ fontSize: 11 }}>{item.extra}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Modal>
  );
}
