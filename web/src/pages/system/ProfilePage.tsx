import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Avatar, Button, Col, Descriptions, Form, Input, Modal, Row, Space, Tabs, Tag } from 'antd';
import { IdcardOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { fmtDateTime } from '../../utils/format';

const DATA_SCOPE_LABELS: Record<string, string> = {
  all: '全部数据',
  dept: '本部门数据',
  self: '本人数据',
};

export default function ProfilePage() {
  const { message } = App.useApp();
  const { user, logout, refreshUser } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') === 'password' ? 'password' : 'info');
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const me = useRequest(() => api.get('/api/auth/me'), []);
  const profile: any = me.data || user || {};
  const permissions: string[] = profile.permissions || [];

  useEffect(() => {
    setTab(sp.get('tab') === 'password' ? 'password' : 'info');
  }, [sp]);

  const onTabChange = (key: string) => {
    setTab(key);
    const next = new URLSearchParams(sp);
    if (key === 'password') next.set('tab', 'password');
    else next.delete('tab');
    setSp(next, { replace: true });
  };

  const permTags = useMemo(() => {
    if (!permissions.length) return [<Tag key="none">无权限</Tag>];
    if (permissions.includes('*')) return [<Tag color="red" key="all">全部权限（*）</Tag>];
    return permissions.map((p) => <Tag key={p} color={p.endsWith('.*') ? 'blue' : 'default'}>{p}</Tag>);
  }, [permissions]);

  const handleChangePassword = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.post('/api/auth/password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码修改成功');
      form.resetFields();
      Modal.success({
        title: '密码修改成功',
        content: '为保证账号安全，请使用新密码重新登录。',
        okText: '重新登录',
        onOk: () => logout(),
      });
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '修改密码失败');
    } finally {
      setSaving(false);
    }
  };

  const isPasswordTab = tab === 'password';

  return (
    <div>
      <PageHeader
        title="个人信息"
        subtitle={isPasswordTab ? '修改当前账号登录密码' : '当前登录账号的基本信息、角色与权限一览'}
        extra={
          <Button
            icon={isPasswordTab ? <IdcardOutlined /> : <LockOutlined />}
            onClick={() => onTabChange(isPasswordTab ? 'info' : 'password')}
          >
            {isPasswordTab ? '返回个人信息' : '修改密码'}
          </Button>
        }
      />

      <Tabs
        activeKey={tab}
        onChange={onTabChange}
        items={[
          {
            key: 'info',
            label: <span><IdcardOutlined /> 账号信息</span>,
            children: (
              <Row gutter={14}>
                <Col xs={24} xl={16}>
                  <div className="card">
                    <div className="card-head">
                      <div className="card-title"><span className="dot" />基本信息</div>
                      <Button size="small" onClick={() => { me.refresh(); refreshUser(); }}>刷新</Button>
                    </div>
                    <div className="card-pad">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                        <Avatar size={64} style={{ background: 'linear-gradient(135deg,#4d8bff,#2f6bff)', fontSize: 26 }}>
                          {profile.name?.slice(0, 1) || 'U'}
                        </Avatar>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 650 }}>{profile.name || '-'}</div>
                          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                            @{profile.username || '-'} · {profile.roleName || '-'}
                            {profile.departmentName ? ` · ${profile.departmentName}` : ''}
                          </div>
                        </div>
                      </div>
                      <Descriptions
                        column={2}
                        size="small"
                        bordered
                        items={[
                          { key: 'username', label: '登录账号', children: profile.username || '-' },
                          { key: 'name', label: '姓名', children: profile.name || '-' },
                          { key: 'role', label: '角色', children: profile.roleName ? `${profile.roleName}（${profile.roleCode || '-'}）` : '-' },
                          { key: 'dept', label: '所属部门', children: profile.departmentName || '-' },
                          { key: 'phone', label: '手机', children: profile.phone || '-' },
                          { key: 'email', label: '邮箱', children: profile.email || '-' },
                          { key: 'scope', label: '数据范围', children: DATA_SCOPE_LABELS[profile.dataScope] || profile.dataScope || '-' },
                          { key: 'lastLogin', label: '最后登录', children: profile.lastLoginAt ? fmtDateTime(profile.lastLoginAt) : '-' },
                        ]}
                      />
                    </div>
                  </div>
                </Col>
                <Col xs={24} xl={8}>
                  <div className="card" style={{ height: '100%' }}>
                    <div className="card-head">
                      <div className="card-title"><span className="dot" />我的权限（{permissions.includes('*') ? '全部' : permissions.length}）</div>
                    </div>
                    <div className="card-pad">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{permTags}</div>
                      <div className="text-muted" style={{ fontSize: 11, marginTop: 12 }}>
                        权限由「角色权限」统一配置；如需调整请联系系统管理员。权限码格式为「模块.动作」，带 * 表示该模块全部动作。
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>
            ),
          },
          {
            key: 'password',
            label: <span><LockOutlined /> 修改密码</span>,
            children: (
              <Row gutter={14}>
                <Col xs={24} xl={10}>
                  <div className="card">
                    <div className="card-head">
                      <div className="card-title"><span className="dot" />修改登录密码</div>
                    </div>
                    <div className="card-pad">
                      <Form form={form} layout="vertical">
                        <Form.Item
                          name="oldPassword"
                          label="原密码"
                          rules={[{ required: true, message: '请输入原密码' }]}
                        >
                          <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
                        </Form.Item>
                        <Form.Item
                          name="newPassword"
                          label="新密码"
                          rules={[
                            { required: true, message: '请输入新密码' },
                            { min: 6, message: '新密码至少 6 位' },
                            { max: 64, message: '新密码不超过 64 位' },
                          ]}
                        >
                          <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
                        </Form.Item>
                        <Form.Item
                          name="confirmPassword"
                          label="确认新密码"
                          dependencies={['newPassword']}
                          rules={[
                            { required: true, message: '请再次输入新密码' },
                            ({ getFieldValue }) => ({
                              validator(_: any, value: string) {
                                if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                                return Promise.reject(new Error('两次输入的新密码不一致'));
                              },
                            }),
                          ]}
                        >
                          <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
                        </Form.Item>
                        <Form.Item style={{ marginBottom: 0 }}>
                          <Space>
                            <Button type="primary" loading={saving} onClick={handleChangePassword}>确认修改</Button>
                            <Button onClick={() => form.resetFields()}>重置</Button>
                          </Space>
                        </Form.Item>
                      </Form>
                    </div>
                  </div>
                </Col>
                <Col xs={24} xl={14}>
                  <Alert
                    type="info"
                    showIcon
                    icon={<SafetyCertificateOutlined />}
                    message="密码安全提示"
                    description={
                      <div style={{ fontSize: 12.5, lineHeight: 1.9 }}>
                        <div>· 新密码长度 6~64 位，建议包含字母、数字与符号组合。</div>
                        <div>· 修改成功后当前登录会话仍有效，系统会提示重新登录以确保安全。</div>
                        <div>· 如忘记密码，请联系系统管理员在「用户管理」中重置。</div>
                      </div>
                    }
                  />
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}
