import React, { useState, useEffect } from 'react';
import { Typography } from 'antd';
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

  return (
    <div style={{ marginBottom: '24px' }}>
      <Title level={3}>{greeting}, {userName}!</Title>
      <Text>Have a great day!</Text>
      {/* 날짜 및 시간 표시 (요청된 형식으로) */}
      <div style={{ marginTop: '8px' }}>
        <Title level={4} style={{ marginBottom: '0px' }}>
          {currentLuxonTime.toFormat('yyyy/MM/dd ccc')} {/* YYYY/MM/DD Day */}
        </Title>
        <Title level={4} style={{ marginTop: '0px' }}>
          {currentLuxonTime.toFormat('h:mm a')} {/* hh:mm AM/PM */}
        </Title>
      </div>
    </div>
  );
}

export default WelcomeMessage; 