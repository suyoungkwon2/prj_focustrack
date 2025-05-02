import React, { useState, useEffect } from 'react';
import { Typography, Card, Divider } from 'antd';
import { DateTime } from 'luxon'; // Luxon 임포트

const { Title, Text } = Typography;

function WelcomeMessage() {
  // Luxon DateTime 객체로 상태 관리
  const [currentLuxonTime, setCurrentLuxonTime] = useState(DateTime.now());
  const [greeting, setGreeting] = useState('');
  const userName = "Mel"; // TODO: 추후 Firebase에서 사용자 이름 가져오기

  useEffect(() => {
    // 1초마다 현재 시간 업데이트
    const timerId = setInterval(() => setCurrentLuxonTime(DateTime.now()), 1000);

    // 시간에 따른 인사말 설정 (Luxon 사용)
    const hours = currentLuxonTime.hour;
    if (hours < 12) {
      setGreeting('Good morning');
    } else if (hours < 18) {
      setGreeting('Good afternoon');
    } else {
      setGreeting('Good evening');
    }

    // 컴포넌트 언마운트 시 타이머 정리
    return () => clearInterval(timerId);
  }, [currentLuxonTime]); // currentLuxonTime이 변경될 때마다 실행

  // Card title로 사용할 React 노드 생성
  const cardTitle = (
    <div>
      {/* 두 텍스트 모두 기본 Text 사용 */}
      <Text style={{ fontSize: '16px', display: 'block' }}>{greeting}, {userName}!</Text>
      <Text style={{ fontSize: '16px', display: 'block' }}>Have a great day!</Text>
    </div>
  );

  return (
    // title prop에 cardTitle 노드 전달
    <Card title={cardTitle}>
      {/* 제목과 날짜/시간 사이에 Divider 추가 */}
      <Divider style={{ marginTop: '0px', marginBottom: '16px' }} />
      {/* 날짜 및 시간 표시 */}
      <div>
        {/* 날짜 폰트 크기 24px 유지 */}
        <Title level={4} style={{ margin: 0, fontSize: '24px', lineHeight: '1.2' }}>
          {currentLuxonTime.toFormat('yyyy/MM/dd (ccc)')} {/* 괄호 추가 */}
        </Title>
        {/* 시간 폰트 크기 36px로 수정 */}
        <Title level={2} style={{ margin: 0, fontSize: '36px', lineHeight: '1.2' }}>
          {currentLuxonTime.toFormat('hh:mm:ss a')} {/* hh 사용 (12시간제) */}
        </Title>
      </div>
    </Card>
  );
}

export default WelcomeMessage; 