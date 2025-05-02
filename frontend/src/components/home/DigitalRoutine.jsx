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
  Current: { color: '#A5D8B4' }, // 현재 시간 강조 색상
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

// --- 초기 그리드 키 생성 (ET 기준 HHMM) ---
const createInitialGridKeys = () => {
   const keys = [];
   for (let hour = 0; hour < TOTAL_HOURS; hour++) {
      const displayHour = (hour + DAY_START_HOUR) % TOTAL_HOURS;
      for (let minuteBlock = 0; minuteBlock < TOTAL_BLOCKS_PER_HOUR; minuteBlock++) {
          const minute = minuteBlock * 10;
          keys.push(`${String(displayHour).padStart(2, '0')}${String(minute).padStart(2, '0')}`);
      }
   }
   return keys;
};

function DigitalRoutine() {
  // 상태 키 변경: YYYY-MM-DD_HHMM 형식 사용
  const [tenMinBlocksByDateTime, setTenMinBlocksByDateTime] = useState({});
  const [dailyLogData, setDailyLogData] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  const [todayDateET, setTodayDateET] = useState(''); // 5 AM 기준 오늘 (for data fetch range & grid mapping)
  const [nextDayDateET, setNextDayDateET] = useState(''); // 5 AM 기준 내일 (for data fetch range & grid mapping)
  const { currentUser, loadingAuth } = useAuth();
  const [currentETBlockKeyHHMM, setCurrentETBlockKeyHHMM] = useState(''); // 현재 블록 (HHMM)
  const [currentActualETDate, setCurrentActualETDate] = useState(''); // 현재 실제 ET 날짜 (YYYY-MM-DD)

  // 날짜 계산 (5AM 기준 today, next day)
  useEffect(() => {
    const nowET = DateTime.now().setZone(TARGET_TIMEZONE);
    let currentDisplayDateObj; // Use DateTime object for clarity
    if (nowET.hour >= DAY_START_HOUR) {
      currentDisplayDateObj = nowET;
    } else {
      currentDisplayDateObj = nowET.minus({ days: 1 });
    }
    const todayStr = currentDisplayDateObj.toFormat('yyyy-MM-dd');
    const nextDayStr = currentDisplayDateObj.plus({ days: 1 }).toFormat('yyyy-MM-dd');
    setTodayDateET(todayStr);
    setNextDayDateET(nextDayStr);
  }, []);

  // 현재 ET 시간 블록 키(HHMM) 및 실제 날짜(YYYY-MM-DD) 계산
  useEffect(() => {
    const calculateCurrentBlock = () => {
      const nowET = DateTime.now().setZone(TARGET_TIMEZONE);
      const hour = nowET.hour;
      const minute = Math.floor(nowET.minute / 10) * 10;
      const keyHHMM = `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
      const actualDateStr = nowET.toFormat('yyyy-MM-dd'); // 실제 ET 날짜
      setCurrentETBlockKeyHHMM(keyHHMM);
      setCurrentActualETDate(actualDateStr);
    };
    calculateCurrentBlock();
    const intervalId = setInterval(calculateCurrentBlock, 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // 데이터 로딩 로직 수정: 상태 키 변경 및 병합
  useEffect(() => {
    if (loadingAuth || !currentUser || !todayDateET || !nextDayDateET) {
      if (!currentUser) setLoadingData(false); // 사용자가 없으면 로딩 중지
      return;
    }

    setLoadingData(true);
    setError(null);
    setTenMinBlocksByDateTime({}); // 리스너 설정 전 상태 초기화
    setDailyLogData(null);

    let blockListenerActive = true;
    let logListenerActive = true;
    let blockDataReceived = false;
    let logDataReceived = false;

    const checkLoadingDone = () => {
      if (blockDataReceived && logDataReceived) setLoadingData(false);
    };

    const userId = currentUser.uid;
    const blocksRef = collection(db, `users/${userId}/tenMinutesBlock`);
    const q = query(blocksRef, where('blockDateET', 'in', [todayDateET, nextDayDateET]));

    const unsubscribeBlocks = onSnapshot(q, (querySnapshot) => {
      if (!blockListenerActive) return;
      const newBlocksData = {}; // 스냅샷의 유효 데이터 임시 저장
      querySnapshot.forEach((doc) => {
          const data = doc.data();
          const blockTimeET = data.blockTimeET; // HH:mm 형식
          const blockDateET = data.blockDateET; // YYYY-MM-DD 형식

          // 유효성 검사 및 키 생성 (YYYY-MM-DD_HHMM)
          if (blockDateET && blockTimeET && (blockDateET === todayDateET || blockDateET === nextDayDateET)) {
              const key = `${blockDateET}_${blockTimeET.replace(':', '')}`;
              newBlocksData[key] = data;
          }
      });

      // 상태 업데이트: 이전 상태와 병합 (YYYY-MM-DD_HHMM 키 사용)
      setTenMinBlocksByDateTime(prevData => ({ ...prevData, ...newBlocksData }));

      if (!blockDataReceived) {
          blockDataReceived = true;
          checkLoadingDone();
      }
    }, (err) => {
      if (!blockListenerActive) return;
      console.error("Error fetching tenMinutesBlock:", err);
      setError(`Failed to load block data: ${err.code}`);
      if (!blockDataReceived) blockDataReceived = true;
      checkLoadingDone();
      setLoadingData(false);
    });

    // dailylog 리스너 (todayDateET 사용 - 변경 없음)
    const logRef = doc(db, `users/${userId}/dailylog`, todayDateET);
    const unsubscribeLog = onSnapshot(logRef, (docSnapshot) => {
      if (!logListenerActive) return;
      setDailyLogData(docSnapshot.exists() ? (docSnapshot.data().digitalRoutine || {}) : {});
      if (!logDataReceived) {
          logDataReceived = true;
          checkLoadingDone();
      }
    }, (err) => {
      if (!logListenerActive) return;
      console.error("Error fetching dailyLog:", err);
      setError(`Failed to load daily log data: ${err.code}`);
      if (!logDataReceived) logDataReceived = true;
      checkLoadingDone();
      setLoadingData(false);
    });

    return () => {
      blockListenerActive = false;
      logListenerActive = false;
      unsubscribeBlocks();
      unsubscribeLog();
    };
  }, [loadingAuth, currentUser, todayDateET, nextDayDateET]);

  // --- 렌더링 로직 ---
  const timeGridStructure = useMemo(() => {
     const grid = [];
     for (let hour = 0; hour < TOTAL_HOURS; hour++) {
       const displayHour = (hour + DAY_START_HOUR) % TOTAL_HOURS;
       const hourCells = [];
       for (let minuteBlock = 0; minuteBlock < TOTAL_BLOCKS_PER_HOUR; minuteBlock++) {
         const minute = minuteBlock * 10;
         const blockTimeKeyHHMM = `${String(displayHour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
         hourCells.push({ keyHHMM: blockTimeKeyHHMM, displayHour, minute }); // key 이름 변경
       }
       grid.push({ hour: displayHour, cells: hourCells });
     }
     return grid;
  }, []);

  const renderTotalDurations = () => {
    return (
      <div style={{ marginBottom: '16px' }}>
        {Object.entries(CATEGORIES)
          .filter(([key]) => key !== 'NA' && key !== 'Current')
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

  // renderTimeGrid 수정: 날짜 기반 조회 키 생성 및 사용
  const renderTimeGrid = () => {
    // 현재 시간 블록의 전체 키 생성 (YYYY-MM-DD_HHMM)
    const currentBlockFullKey = `${currentActualETDate}_${currentETBlockKeyHHMM}`;

    return (
       <div style={{ display: 'flex', flexDirection: 'column' }}>
         {timeGridStructure.map(({ hour, cells }) => (
             <div key={hour} style={{ display: 'flex', alignItems: 'center', marginBottom: '1px' }}>
               <Text style={{ width: '35px', textAlign: 'right', marginRight: '8px', fontSize: '12px', color: textColor }}>
                 {String(hour).padStart(2, '0')}
               </Text>
               <div style={{ display: 'flex', flexGrow: 1 }}>
                   {cells.map(({ keyHHMM, displayHour, minute }) => { // keyHHMM 사용
                       // 조회할 날짜 결정 (00-04시는 nextDay, 05-23시는 today)
                       const targetDate = (displayHour >= 0 && displayHour < DAY_START_HOUR)
                                           ? nextDayDateET
                                           : todayDateET;

                       // 최종 조회 키 생성 (YYYY-MM-DD_HHMM)
                       const lookupKey = `${targetDate}_${keyHHMM}`;

                       // 변경된 상태와 키로 데이터 조회
                       const blockData = tenMinBlocksByDateTime[lookupKey];
                       const category = getMajorCategory(blockData);
                       const color = CATEGORIES[category]?.color || CATEGORIES.NA.color;

                       const startTimeStr = `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                       let endTimeFormatted = `${String(displayHour).padStart(2, '0')}:${String(minute + 10).padStart(2, '0')}`;
                       if (minute + 10 === 60) {
                           endTimeFormatted = `${String((displayHour + 1) % 24).padStart(2, '0')}:00`;
                       }

                       // 현재 시간 블록 비교 (전체 키 사용)
                       const isCurrentBlock = lookupKey === currentBlockFullKey;

                       const blockStyle = {
                         backgroundColor: color,
                         width: `calc(100% / ${TOTAL_BLOCKS_PER_HOUR})`,
                         height: '18px',
                         boxSizing: 'border-box',
                         transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
                         border: '1px solid #fff',
                       };

                       if (isCurrentBlock) {
                         blockStyle.boxShadow = `inset 0 0 0 2px ${CATEGORIES.Current.color}`;
                       }

                       return (
                         <div
                           key={lookupKey} // key prop도 고유하게 변경
                           style={blockStyle}
                           title={`${startTimeStr} - ${endTimeFormatted} - ${category}${isCurrentBlock ? ' (Current)' : ''}`}
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