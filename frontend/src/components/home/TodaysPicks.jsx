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
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
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
    console.log(`TodaysPicks (${classifiedTopic}): useEffect triggered with`, { userId, sessionIds });

    const fetchFocusSessions = async () => {
      if (!userId || sessionIds.length === 0) {
        setFocusSessions([]);
        setLoadingSessions(false);
        return;
      }

      setLoadingSessions(true);
      setErrorSessions(null);

      try {
        const sessionsPromises = sessionIds.map(async (sessionId) => {
          try {
            const sessionsRef = collection(db, 'users', userId, 'focusSessions');
            const q = query(sessionsRef, where('id', '==', sessionId), limit(1));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              const docSnap = querySnap.docs[0];
              return {
                id: docSnap.id,
                url: docSnap.data().url,
                title: docSnap.data().title
              };
            } else {
              console.warn(`Session document not found (by field id): ${sessionId} for user ${userId}`);
              return null;
            }
          } catch (err) {
            console.error(`Error querying session ${sessionId}:`, err);
            return null;
          }
        });

        const results = await Promise.allSettled(sessionsPromises);
        const fetchedSessions = results
           .filter(result => result.status === 'fulfilled' && result.value !== null)
           .map(result => result.value);

        const failedCount = results.filter(result => result.status === 'rejected' || (result.status === 'fulfilled' && result.value === null)).length;
        if (failedCount > 0) {
           console.warn(`${failedCount} session(s) could not be loaded for topic: ${classifiedTopic}`);
        }

        console.log(`TodaysPicks (${classifiedTopic}): Fetched sessions`, fetchedSessions);

        setFocusSessions(fetchedSessions);

      } catch (error) {
        console.error("Error fetching focus sessions:", error);
        setErrorSessions("Failed to load session details.");
      } finally {
        setLoadingSessions(false);
      }
    };

    fetchFocusSessions();
  }, [userId, sessionIds, classifiedTopic]);

  // 표시할 세션 목록 결정
  const sessionsToShow = isExpanded ? focusSessions : focusSessions.slice(0, 1);

  console.log(`TodaysPicks (${classifiedTopic}): Rendering state`, { loadingSessions, errorSessions, focusSessionsCount: focusSessions.length, sessionsToShowCount: sessionsToShow.length });

  const renderSession = (session, idx) => {
    const faviconUrl = getFaviconUrl(session.url);
    let displayTitle = session.title;
    if (!displayTitle) {
      try {
        displayTitle = new URL(session.url).hostname;
      } catch (e) {
        displayTitle = session.url || 'Invalid URL';
      }
    }

    return (
      <div
        key={session.id || session.url}
        style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}
      >
        {faviconUrl && <Avatar
                         src={faviconUrl}
                         size="small"
                         style={{ marginRight: '8px' }}
                         alt={`${displayTitle} Favicon`}
                       />}
        <Tooltip title={session.url}>
          <Link
            href={session.url}
            target="_blank"
            style={{
              color: 'inherit',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayTitle}
          </Link>
        </Tooltip>

        {idx === 0 && focusSessions.length > 1 && !loadingSessions && (
          <Button
            type="link"
            icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ marginLeft: 'auto', padding: 0 }}
          >
            {isExpanded ? 'Hide' : 'See All'}
          </Button>
        )}
      </div>
    );
  };

  if (!classifiedTopic) {
    return null;
  }

  return (
    <div style={{ padding: '0 16px' }}>
       <Title level={5} style={{ marginBottom: '16px' }}>{classifiedTopic}</Title>
       {Array.isArray(classifiedSummary) && classifiedSummary.length > 0 ? (
         <>
           <ul style={{ paddingLeft: '20px', marginBottom: '8px' }}>
             {(showAllSummary ? classifiedSummary : classifiedSummary.slice(0, 3)).map((item, index) => {
               return (
                 <li key={index}>
                   {item}
                 </li>
               );
             })}
           </ul>
           {classifiedSummary.length > 3 && (
              <div style={{ textAlign: 'right' }}>
                 <Button
                   type="link"
                   size="small"
                   onClick={() => setShowAllSummary(!showAllSummary)}
                   style={{ padding: 0 }}
                 >
                   {showAllSummary ? 'less' : 'more'}
                 </Button>
             </div>
           )}
         </>
       ) : (
         <Paragraph>{typeof classifiedSummary === 'string' ? classifiedSummary : 'No summary available.'}</Paragraph>
       )}

      {loadingSessions && <Spin size="small" />}
      {errorSessions && <Alert message={errorSessions} type="error" showIcon style={{ marginBottom: '8px' }}/>}

      {!loadingSessions && sessionsToShow.map((s, i) => renderSession(s, i))}

       {!loadingSessions && !errorSessions && focusSessions.length === 0 && sessionIds.length > 0 && (
         <Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>No session details found.</Text>
       )}
    </div>
  );
}

export default TodaysPicks; 