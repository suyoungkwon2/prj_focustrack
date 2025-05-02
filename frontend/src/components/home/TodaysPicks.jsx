import React, { useState, useEffect } from 'react';
import { Card, Typography, Avatar, Button, Tooltip, Spin, Alert } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons'; // Ant Design 아이콘 사용
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore'; // Firestore 함수 추가
import { db } from '../../firebase/config'; // Firebase 설정 확인

const { Title, Paragraph, Link, Text } = Typography;

// Favicon URL 생성 함수 (FrequentlyVisitedSites.jsx 참고)
const getFaviconUrl = (url) => {
  try {
    // 유효한 URL인지 확인 후 파비콘 URL 생성
    new URL(url);
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(url)}`;
  } catch (e) {
    // 유효하지 않은 URL 처리 (기본 아이콘 또는 null 반환)
    console.error("Invalid URL for favicon:", url);
    return null; // 또는 기본 이미지 URL
  }
};

// URL에서 도메인 추출 (표시용)
const getDomainFromUrl = (url) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url; // 파싱 실패 시 전체 URL 반환
  }
};

// 이제 userId와 sessionIds를 props로 받습니다.
function TodaysPicks({ userId, classifiedTopic, classifiedSummary = [], sessionIds = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [focusSessions, setFocusSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [errorSessions, setErrorSessions] = useState(null);
  const [showAllSummary, setShowAllSummary] = useState(false); // summary 토글 상태

  // sessionIds나 userId가 변경되면 focusSessions 데이터를 다시 가져옵니다.
  useEffect(() => {
    // --- 로그 추가 ---
    console.log(`TodaysPicks (${classifiedTopic}): useEffect triggered with`, { userId, sessionIds });
    // ---------------

    const fetchFocusSessions = async () => {
      if (!userId || sessionIds.length === 0) {
        setFocusSessions([]);
        setLoadingSessions(false);
        return;
      }

      setLoadingSessions(true);
      setErrorSessions(null); // 에러 상태 초기화

      try {
        const sessionsPromises = sessionIds.map(async (sessionId) => {
          try {
            const sessionsRef = collection(db, 'users', userId, 'focusSessions');
            const q = query(sessionsRef, where('id', '==', sessionId), limit(1));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              const docSnap = querySnap.docs[0];
              return { id: docSnap.id, url: docSnap.data().url };
            } else {
              console.warn(`Session document not found (by field id): ${sessionId} for user ${userId}`);
              return null;
            }
          } catch (err) {
            console.error(`Error querying session ${sessionId}:`, err);
            return null;
          }
        });

        // Promise.allSettled를 사용하여 일부 실패해도 나머지는 처리
        const results = await Promise.allSettled(sessionsPromises);
        const fetchedSessions = results
           .filter(result => result.status === 'fulfilled' && result.value !== null)
           .map(result => result.value);

        // 일부 세션 로드 실패 시 경고/에러 처리
        const failedCount = results.filter(result => result.status === 'rejected' || (result.status === 'fulfilled' && result.value === null)).length;
        if (failedCount > 0) {
           console.warn(`${failedCount} session(s) could not be loaded for topic: ${classifiedTopic}`);
           // 부분 로딩 에러 메시지 설정 (선택 사항)
           // setErrorSessions(`${failedCount} session(s) failed to load.`);
        }

        // --- 로그 추가 ---
        console.log(`TodaysPicks (${classifiedTopic}): Fetched sessions`, fetchedSessions);
        // ---------------

        setFocusSessions(fetchedSessions);

      } catch (error) {
        console.error("Error fetching focus sessions:", error);
        setErrorSessions("Failed to load session details.");
      } finally {
        setLoadingSessions(false);
      }
    };

    fetchFocusSessions();
  }, [userId, sessionIds, classifiedTopic]); // classifiedTopic도 의존성에 추가 (로그용)

  // 표시할 세션 목록 결정
  const sessionsToShow = isExpanded ? focusSessions : focusSessions.slice(0, 1);

  // --- 로그 추가 ---
  console.log(`TodaysPicks (${classifiedTopic}): Rendering state`, { loadingSessions, errorSessions, focusSessionsCount: focusSessions.length, sessionsToShowCount: sessionsToShow.length });
  // ---------------

  const renderSession = (session) => {
     const faviconUrl = getFaviconUrl(session.url);
     const displayUrl = getDomainFromUrl(session.url); // 또는 전체 URL을 표시할 수 있음

      return (
          <div key={session.id || session.url} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              {faviconUrl && <Avatar src={faviconUrl} size="small" style={{ marginRight: '8px' }} />}
               {/* Tooltip으로 전체 URL 표시 */}
               <Tooltip title={session.url}>
                 {/* target="_blank" 로 새 탭에서 열리도록 수정 */}
                 <Link href={session.url} target="_blank" style={{ color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayUrl}
                 </Link>
              </Tooltip>
          </div>
      );
  };

  if (!classifiedTopic) {
     return null;
  }

  return (
    // Ant Design Card 컴포넌트 사용 (추후 디자인에 맞게 수정)
    <Card title={classifiedTopic} style={{ marginBottom: '24px' }}>
       {/* 요약 내용을 불릿 리스트로 표시 */}
       {Array.isArray(classifiedSummary) && classifiedSummary.length > 0 ? (
         <>
           <ul style={{ paddingLeft: '20px', marginBottom: '8px' }}>
             {(showAllSummary ? classifiedSummary : classifiedSummary.slice(0, 3)).map((item, index) => (
               <li key={index}>{item}</li>
             ))}
           </ul>
           {classifiedSummary.length > 3 && (
             <Button type="link" size="small" onClick={() => setShowAllSummary(!showAllSummary)} style={{ padding: 0 }}>
               {showAllSummary ? 'less' : 'more'}
             </Button>
           )}
         </>
       ) : (
         <Paragraph>{typeof classifiedSummary === 'string' ? classifiedSummary : 'No summary available.'}</Paragraph>
       )}

      {/* 세션 로딩 상태 표시 */}
      {loadingSessions && <Spin size="small" />}
      {/* 세션 로딩 에러 표시 */}
      {errorSessions && <Alert message={errorSessions} type="error" showIcon style={{ marginBottom: '8px' }}/>}

      {/* 로드된 세션 목록 표시 */}
      {!loadingSessions && sessionsToShow.map(renderSession)}

      {/* "See All" 토글 버튼 (세션이 2개 이상일 때만 표시) */}
      {!loadingSessions && focusSessions.length > 1 && (
        <Button
          type="link"
          icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ padding: '0', height: 'auto', lineHeight: 'inherit' }} // 버튼 스타일 조정
        >
          See All
        </Button>
      )}
      {/* 세션 데이터가 없는 경우 (선택 사항) */}
       {!loadingSessions && !errorSessions && focusSessions.length === 0 && sessionIds.length > 0 && (
         <Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>No session details found.</Text>
       )}
    </Card>
  );
}

export default TodaysPicks; 