import React from 'react';
import { Row, Col, Spin, Typography, Space } from 'antd';
import { useAuth } from '../contexts/AuthContext';
import WelcomeMessage from '../components/home/WelcomeMessage';
import Monitoring from '../components/home/Monitoring';
import FrequentlyVisitedSites from '../components/home/FrequentlyVisitedSites';
import TodaysPicksList from '../components/home/TodaysPicksList';
import GSuites from '../components/home/GSuites';
import DigitalRoutine from '../components/home/DigitalRoutine';
import SmartAlerts from '../components/home/SmartAlerts';

const { Text } = Typography;

function HomePage() {
  const leftColSpan = 6;
  const middleColSpan = 10;
  const rightColSpan = 7;

  const { currentUser, loadingAuth } = useAuth();

  console.log("HomePage Auth State:", { loadingAuth, userId: currentUser?.uid });

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <Row gutter={[24, 24]}>
        <Col span={leftColSpan}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <WelcomeMessage />
            {/* <SmartAlerts /> */}
            <GSuites />
            <FrequentlyVisitedSites />
          </Space>
        </Col>

        <Col span={middleColSpan}>
          {loadingAuth && <Spin tip="Initializing user..." />}
          {!loadingAuth && currentUser && <TodaysPicksList userId={currentUser.uid} />}
          {!loadingAuth && !currentUser && <Text>Please log in to see Today's Picks.</Text>}
        </Col>

        <Col span={rightColSpan}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Monitoring />
            <DigitalRoutine />
          </Space>
        </Col>
      </Row>
    </div>
  );
}

export default HomePage; 