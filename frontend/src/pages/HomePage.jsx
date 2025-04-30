import React from 'react';
import { Row, Col } from 'antd';
import WelcomeMessage from '../components/home/WelcomeMessage';
import Monitoring from '../components/home/Monitoring';
import FrequentlyVisitedSites from '../components/home/FrequentlyVisitedSites';
import TodaysPicks from '../components/home/TodaysPicks';
import GSuites from '../components/home/GSuites';
import DigitalRoutine from '../components/home/DigitalRoutine';
import SmartAlerts from '../components/home/SmartAlerts';

function HomePage() {
  const leftColSpan = 6;
  const middleColSpan = 10;
  const rightColSpan = 8;

  return (
    <Row gutter={[24, 24]}>
      <Col span={leftColSpan}>
        <WelcomeMessage />
        <SmartAlerts />
        <Monitoring />
        <FrequentlyVisitedSites />
      </Col>

      <Col span={middleColSpan}>
        <TodaysPicks />
      </Col>

      <Col span={rightColSpan}>
        <GSuites />
        <DigitalRoutine />
      </Col>
    </Row>
  );
}

export default HomePage; 