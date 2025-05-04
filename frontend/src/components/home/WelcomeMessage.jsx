import React, { useState, useEffect } from 'react';
import { Typography, Card, Divider } from 'antd';
import { DateTime } from 'luxon'; // Luxon 임포트
import { useAuth } from '../../contexts/AuthContext'; // useAuth 추가
import { doc, onSnapshot } from 'firebase/firestore'; // onSnapshot 추가, getDoc 제거
import { db } from '../../firebase/config'; // Firestore 설정 확인

const { Title, Text } = Typography;

function WelcomeMessage() {
  // Luxon DateTime 객체로 상태 관리
  const [currentLuxonTime, setCurrentLuxonTime] = useState(DateTime.now());
  const [greeting, setGreeting] = useState('');
  const [nickname, setNickname] = useState(''); // 닉네임 상태 추가
  const [loadingNickname, setLoadingNickname] = useState(true); // 닉네임 로딩 상태 추가
  const { currentUser } = useAuth(); // 사용자 정보 가져오기

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

  // 닉네임 가져오기 useEffect (onSnapshot 사용)
  useEffect(() => {
    if (!currentUser) {
      setLoadingNickname(false); // 로그아웃 시 로딩 해제
      setNickname('');
      return;
    }

    setLoadingNickname(true);
    const userDocRef = doc(db, 'users_list', currentUser.uid);

    // onSnapshot으로 실시간 리스너 설정
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().nickName) {
        setNickname(docSnap.data().nickName);
      } else {
        setNickname(''); // 닉네임 없으면 빈 문자열
      }
      setLoadingNickname(false); // 데이터 로드 완료 (또는 변경 감지 완료)
    }, (error) => {
      console.error("Error listening to nickname:", error);
      setNickname(''); // 에러 시 빈 문자열
      setLoadingNickname(false);
    });

    // 컴포넌트 언마운트 시 리스너 정리
    return () => unsubscribe();

  }, [currentUser]);

  // Card title로 사용할 React 노드 생성 (원래 구조 복구)
  const cardTitle = (
    <div>
      <Text style={{ fontSize: '16px', display: 'block' }}>
        {greeting}, {loadingNickname ? '...' : (nickname || 'lovely user')}!
      </Text>
    </div>
  );

  return (
    <Card title={cardTitle} style={{ marginBottom: 0 }}>
      <div>
        <Title level={5}>{greeting}</Title>
        {/* 날짜 및 시간 표시 */}
        <Text style={{ fontSize: '24px', fontWeight: 'bold', display: 'block' }}>
          {currentLuxonTime.toFormat('yyyy/MM/dd (ccc)')}
        </Text>
        <Title level={2} style={{ margin: 0, fontSize: '24px', lineHeight: '1.2' }}>
          {currentLuxonTime.toFormat('hh:mm:ss a')}
        </Title>
      </div>
    </Card>
  );
}

export default WelcomeMessage; 