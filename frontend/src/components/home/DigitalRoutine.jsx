import React, { useState, useEffect, useMemo } from 'react';
import { Card, Typography, Tag, Spin } from 'antd';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase/config'; // Firebase 설정 임포트
import { DateTime } from 'luxon';
import { useAuth } from '../../contexts/AuthContext'; // useAuth 임포트

const { Text } = Typography;

// --- 상수 정의 ---
const TARGET_TIMEZONE = 'America/New_York'; // ET 시간대
const DAY_START_HOUR = 5; // 하루 시작 시간 (오전 5시)
const TOTAL_BLOCKS_PER_HOUR = 6; // 시간당 블록 수 (10분 단위)
const TOTAL_HOURS = 24;

// 카테고리 정보 (색상, 아이콘 이모지)
const CATEGORIES = {
  Growth: { color: '#99DAFF', icon: '📘', nameColor: 'black' },
  DailyLife: { color: '#FFDDAD', icon: '🏠', nameColor: 'black' },
  Entertainment: { color: '#FFD6E8', icon: '🎮', nameColor: 'black' },
  NA: { color: '#F3F3F3' }, // NA 색상 변경
};

// 텍스트 색상
const textColor = '#A8A8A8';

// --- Helper 함수 ---
// 초를 HH:MM:SS 형식으로 변환
const formatDuration = (totalSeconds) => {
  if (typeof totalSeconds !== 'number' || totalSeconds < 0) {
    return '00:00:00';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// 10분 블록 데이터로부터 Major Category 결정
const getMajorCategory = (blockData) => {
  if (!blockData) return 'NA';
  const durations = [
    { category: 'Growth', duration: blockData.tenMinutesDurationGrowth || 0 },
    { category: 'DailyLife', duration: blockData.tenMinutesDurationDailyLife || 0 },
    { category: 'Entertainment', duration: blockData.tenMinutesDurationEntertainment || 0 },
  ];
  // 0보다 큰 duration만 필터링
  const activeDurations = durations.filter(d => d.duration > 0);
  if (activeDurations.length === 0) return 'NA';
  // 가장 큰 duration 찾기
  activeDurations.sort((a, b) => b.duration - a.duration);
  return activeDurations[0].category;
};

// --- 기본 그리드 데이터 생성 ---
const createInitialGridData = () => {
  const initialGrid = {};
   for (let hour = 0; hour < TOTAL_HOURS; hour++) {
      const displayHour = (hour + DAY_START_HOUR) % TOTAL_HOURS;
      for (let minuteBlock = 0; minuteBlock < TOTAL_BLOCKS_PER_HOUR; minuteBlock++) {
          const minute = minuteBlock * 10;
          const blockTimeKey = `${String(displayHour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
          initialGrid[blockTimeKey] = 'NA'; // 초기 상태는 NA
      }
   }
   return initialGrid;
};

function DigitalRoutine() {
  const [blockCategories, setBlockCategories] = useState(createInitialGridData);
  const [dailyLogData, setDailyLogData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [todayDateET, setTodayDateET] = useState('');
  const { currentUser, loadingAuth } = useAuth(); // loadingAuth 상태 가져오기

  // ET 기준 '오늘' 날짜 계산 (feature_digitalroutine.md 기준)
  useEffect(() => {
    const nowET = DateTime.now().setZone(TARGET_TIMEZONE);
    let dateStr;
    if (nowET.hour >= DAY_START_HOUR) {
      dateStr = nowET.toFormat('yyyy-MM-dd');
    } else {
      dateStr = nowET.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    }
    setTodayDateET(dateStr);
  }, []); // 컴포넌트 마운트 시 한 번만 계산

  useEffect(() => {
    // Auth 로딩 중이면 아무것도 안 함
    if (loadingAuth) {
      console.log("DigitalRoutine: Waiting for auth to finish loading...");
      return;
    }
    // Auth 로딩 완료 후 사용자가 없으면 로딩 중지
    if (!currentUser) {
      console.log("DigitalRoutine: No user logged in, stopping data loading.");
      setLoadingData(false);
      return;
    }

    const userId = currentUser.uid;

    // 사용자가 있고 날짜가 설정되었으면 데이터 로딩 시작
    if (todayDateET) {
        setLoadingData(true);
        setError(null);
        let blockListenerActive = true;
        let logListenerActive = true;
        let blockDataReceived = false;
        let logDataReceived = false;

        // console.log(`DigitalRoutine: Setting up listeners for user ${userId} and date ${todayDateET}`);

        // 1. tenMinutesBlock 리스너
        const blocksRef = collection(db, `users/${userId}/tenMinutesBlock`);
        const q = query(blocksRef, where('blockDateET', '==', todayDateET));
        const unsubscribeBlocks = onSnapshot(q, (querySnapshot) => {
            if (!blockListenerActive) return;
            const newBlockCategories = { ...blockCategories };
            querySnapshot.forEach((doc) => {
                const blockTime = doc.id.split('_')[1];
                if (blockTime && newBlockCategories.hasOwnProperty(blockTime)) {
                    const majorCategory = getMajorCategory(doc.data());
                    newBlockCategories[blockTime] = majorCategory;
                }
            });
            setBlockCategories(newBlockCategories);
            blockDataReceived = true;
            if (logDataReceived) setLoadingData(false);
        }, (err) => {
            if (!blockListenerActive) return;
            console.error("Error fetching tenMinutesBlock:", err);
            setError(`Failed to load block data: ${err.code}`);
            setLoadingData(false);
        });

        // 2. dailylog 리스너
        const logRef = doc(db, `users/${userId}/dailylog`, todayDateET);
        const unsubscribeLog = onSnapshot(logRef, (docSnapshot) => {
            if (!logListenerActive) return;
            if (docSnapshot.exists()) {
                setDailyLogData(docSnapshot.data().digitalRoutine || {});
            } else {
                setDailyLogData({});
            }
            logDataReceived = true;
            if (blockDataReceived) setLoadingData(false);
        }, (err) => {
            if (!logListenerActive) return;
            console.error("Error fetching dailyLog:", err);
            setError(`Failed to load daily log data: ${err.code}`);
            setLoadingData(false);
        });

        // 타임아웃은 제거하거나 유지 (선택 사항)

        return () => {
            blockListenerActive = false;
            logListenerActive = false;
            unsubscribeBlocks();
            unsubscribeLog();
        };
    }
  // loadingAuth, currentUser, todayDateET 변경 시 재실행
  }, [loadingAuth, currentUser, todayDateET]);

  // --- 렌더링 로직 ---
  const timeGridStructure = useMemo(() => {
     const grid = [];
     for (let hour = 0; hour < TOTAL_HOURS; hour++) {
       const displayHour = (hour + DAY_START_HOUR) % TOTAL_HOURS;
       const hourCells = [];
       for (let minuteBlock = 0; minuteBlock < TOTAL_BLOCKS_PER_HOUR; minuteBlock++) {
         const minute = minuteBlock * 10;
         const blockTimeKey = `${String(displayHour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
         hourCells.push({ key: blockTimeKey, displayHour, minute });
       }
       grid.push({ hour: displayHour, cells: hourCells });
     }
     return grid;
  }, []);

  const renderTotalDurations = () => {
    return (
      <div style={{ marginBottom: '16px' }}>
        {Object.entries(CATEGORIES)
          .filter(([key]) => key !== 'NA')
          .map(([key, { icon, color, nameColor }]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <Tag color={color} style={{ marginRight: '8px', border: 'none', padding: '4px 8px' }}>
                 <span role="img" aria-label={key} style={{ marginRight: '5px' }}>{icon}</span>
                 <span style={{ color: nameColor || 'inherit' }}>{key}</span>
               </Tag>
               <Text style={{ color: textColor }}>
                 {dailyLogData ? formatDuration(dailyLogData[`dailyDuration${key}`]) : (loadingData ? '...' : '00:00:00')}
              </Text>
            </div>
          ))}
      </div>
    );
  };

  const renderTimeGrid = () => {
    return (
       <div style={{ display: 'flex', flexDirection: 'column' }}>
         {timeGridStructure.map(({ hour, cells }) => (
             <div key={hour} style={{ display: 'flex', alignItems: 'center' }}>
               <Text style={{ width: '30px', textAlign: 'right', marginRight: '5px', fontSize: '12px', color: textColor }}>
                 {String(hour).padStart(2, '0')}
               </Text>
               <div style={{ display: 'flex', flexGrow: 1 }}>
                   {cells.map(({ key, displayHour, minute }) => {
                       const category = blockCategories[key] || 'NA';
                       const color = CATEGORIES[category]?.color || CATEGORIES.NA.color;
                       return (
                         <div
                           key={key}
                           style={{
                             backgroundColor: color,
                             width: `calc(100% / ${TOTAL_BLOCKS_PER_HOUR})`,
                             height: '18px',
                             border: '1px solid #fff',
                             boxSizing: 'border-box',
                             transition: 'background-color 0.3s ease',
                           }}
                           title={`${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} - ${category}`}
                         />
                       );
                   })}
               </div>
             </div>
         ))}
       </div>
    );
  };

  // 최종 렌더링
  return (
    <Card title="Digital Routine" style={{ marginBottom: '24px' }}>
      {/* Auth 로딩 중 메시지 */}
      {loadingAuth && <Text>Please wait, initializing user state...</Text>}

      {/* Auth 완료 후 사용자 없으면 메시지 */}
      {!loadingAuth && !currentUser && <Text>User not available. Cannot load data.</Text>}

      {/* Auth 완료 및 사용자 있으면 데이터 로딩/표시 */}
      {!loadingAuth && currentUser && (
        <>
          {error && <Text type="danger">Error: {error}</Text>}
          {/* 데이터 로딩 Spin 표시 */}
          <Spin spinning={loadingData} tip="Loading Digital Routine...">
              {renderTotalDurations()}
              {renderTimeGrid()}
          </Spin>
        </>
      )}
    </Card>
  );
}

export default DigitalRoutine; 