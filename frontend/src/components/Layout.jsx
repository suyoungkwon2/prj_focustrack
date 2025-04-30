import React from 'react';
import { Layout as AntLayout, Menu } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Header, Content } = AntLayout;

// 네비게이션 메뉴 아이템 정의
const items = [
  { key: '/', label: <Link to="/">Today</Link> },
  { key: '/trend', label: <Link to="/trend">Trend</Link> },
  { key: '/gallery', label: <Link to="/gallery">Gallery</Link> },
  { key: '/history', label: <Link to="/history">History</Link> },
  // { key: '/settings', label: <Link to="/settings">Settings</Link> }, // 추후 추가
];

function Layout() {
  const location = useLocation();
  // 현재 경로에 맞는 메뉴 키를 자동으로 선택
  const selectedKeys = [location.pathname];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0', padding: '0 50px' }}>
        {/* 로고 Placeholder */}
        <div className="logo" style={{ color: '#1890ff', marginRight: '24px', fontWeight: 'bold', fontSize: '18px' }}>FocusTrack</div>
        <Menu
          theme="light"
          mode="horizontal"
          selectedKeys={selectedKeys} // 현재 경로에 따라 메뉴 활성화
          items={items}
          style={{ flex: 1, borderBottom: 'none' }} // 메뉴가 남은 공간 차지, 하단 선 제거
        />
         {/* 사용자 프로필 Placeholder */}
         <div style={{ marginLeft: 'auto' }}>Mel Kwon</div> {/* TODO: 사용자 이름 동적으로 표시 */}
      </Header>
      <Content style={{ padding: '24px 50px', maxWidth: 'none' }}>
         {/* 중첩된 라우트의 컴포넌트가 여기에 렌더링됨 */}
        <Outlet />
      </Content>
    </AntLayout>
  );
}

export default Layout; 