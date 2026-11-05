import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="页面不存在"
      subTitle="该功能页面可能尚未开放，或您没有访问权限"
      extra={<Button type="primary" onClick={() => navigate('/dashboard')}>返回工作台</Button>}
    />
  );
}
