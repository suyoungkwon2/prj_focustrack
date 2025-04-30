import React, { useState, useEffect } from 'react';
import { Typography } from 'antd';

const { Title, Text } = Typography;

function WelcomeMessage() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState('');
  const userName = "Mel"; // TODO: 추후 Firebase에서 사용자 이름 가져오기

  useEffect(() => {
    // 1초마다 현재 시간 업데이트
    const timerId = setInterval(() => setCurrentTime(new Date()), 1000);

    // 시간에 따른 인사말 설정
    const hours = currentTime.getHours();
    if (hours < 12) {
      setGreeting('Good morning');
    } else if (hours < 18) {
      setGreeting('Good afternoon');
    } else {
      setGreeting('Good evening');
    }

    // 컴포넌트 언마운트 시 타이머 정리
    return () => clearInterval(timerId);
  }, [currentTime]); // currentTime이 변경될 때마다 인사말 재계산 (매초)

  return (
    <div style={{ marginBottom: '24px' }}>
      <Title level={3}>{greeting}, {userName}!</Title>
      <Text>Have a great day!</Text>
      <Title level={4} style={{ marginTop: '8px' }}>
        {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })}
      </Title>
    </div>
  );
}

export default WelcomeMessage; 