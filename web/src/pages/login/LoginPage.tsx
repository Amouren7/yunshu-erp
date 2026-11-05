import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Checkbox, Form, Input, App } from 'antd';
import { LockOutlined, UserOutlined, SafetyOutlined } from '@ant-design/icons';
import { useAuth } from '../../store/auth';

const ACCOUNTS = [
  { username: 'admin', password: 'admin123', label: '系统管理员' },
  { username: 'chenjing', password: 'sales123', label: '销售经理' },
  { username: 'wanglei', password: 'buy123', label: '采购经理' },
  { username: 'zhaomin', password: 'stock123', label: '仓库管理员' },
  { username: 'zhouting', password: 'fin123', label: '财务会计' },
  { username: 'sunyue', password: 'hr123', label: '人事行政' },
  { username: 'guest', password: 'guest123', label: '只读访客' },
];

const FEATURES = [
  ['销售管理', '报价 · 订单 · 发货 · 退货 · 回款'],
  ['采购管理', '申请 · 订单 · 入库 · 退货 · 付款'],
  ['库存管理', '出入库 · 调拨 · 盘点 · 批次 · 预警'],
  ['生产制造', 'BOM · 工单 · 领料 · 报工 · 完工'],
  ['财务管理', '总账 · 凭证 · 应收应付 · 三大报表'],
  ['报表中心', '经营看板 · 毛利分析 · 客户贡献'],
];

export default function LoginPage() {
  const { login } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const user = await login(values.username, values.password);
      message.success(`欢迎回来，${user.name}`);
      navigate(params.get('redirect') || '/dashboard', { replace: true });
    } catch (e: any) {
      message.error(e?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-brand">
          <div className="login-brand-logo">云</div>
          <div>
            <div className="login-brand-name">云枢ERP</div>
            <div className="login-brand-sub">YUNSHU · ENTERPRISE RESOURCE PLANNING</div>
          </div>
        </div>

        <div>
          <h1 className="login-title">
            一体化企业资源计划平台
            <br />
            让经营数据实时可见
          </h1>
          <p className="login-desc">
            覆盖销售、采购、库存、生产、财务、人力资源与客户关系的全流程管理。
            业务单据自动过账，库存与总账实时联动，为制造与贸易企业提供从订单到收款、从采购到付款的端到端数字化能力。
          </p>
          <div className="login-features">
            {FEATURES.map(([title, desc]) => (
              <div className="login-feature" key={title}>
                <b>{title}</b>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="login-footer">
          云枢科技（深圳）有限公司 · 云枢ERP V1.0.0 · 演示环境（数据为模拟数据）
        </div>
      </div>

      <div className="login-panel">
        <div className="login-form-wrap">
          <div className="login-form-title">账号登录</div>
          <div className="login-form-sub">请使用企业账号登录系统，首次使用请联系系统管理员</div>
          <Form form={form} onFinish={onFinish} size="large" initialValues={{ username: 'admin', password: 'admin123', remember: true }}>
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined style={{ color: '#8b98ab' }} />} placeholder="用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: '#8b98ab' }} />} placeholder="密码" autoComplete="current-password" />
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, marginTop: -6 }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>记住登录状态</Checkbox>
              </Form.Item>
              <a style={{ fontSize: 12 }} onClick={() => message.info('请联系系统管理员重置密码')}>忘记密码？</a>
            </div>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 42, fontWeight: 600 }}>
              登 录
            </Button>
          </Form>

          <div className="login-accounts">
            <div className="login-accounts-title"><SafetyOutlined /> 演示账号（点击自动填充）</div>
            <div className="login-account-chips">
              {ACCOUNTS.map((a) => (
                <span
                  key={a.username}
                  className="login-account-chip"
                  onClick={() => form.setFieldsValue({ username: a.username, password: a.password })}
                >
                  {a.label}
                </span>
              ))}
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.7 }}>
              管理员：admin / admin123 &nbsp;·&nbsp; 其他账号密码规则见上方角色标签
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
