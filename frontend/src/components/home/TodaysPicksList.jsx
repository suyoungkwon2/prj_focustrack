import React, { useState, useEffect } from 'react';
import { Card, Spin, Typography, Divider } from 'antd';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config'; // Firebase 설정 확인
import TodaysPicks from './TodaysPicks'; // 개별 Pick 컴포넌트

const { Text, Title } = Typography;

function TodaysPicksList({ userId }) {
  const [picksList, setPicksList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log("TodaysPicksList received userId:", userId);
    if (!userId) {
      setError("User ID is not provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const classedCollectionRef = collection(db, 'users', userId, 'classed');
    // Firestore 문서에 'createdAt' 필드가 있고, 최신 6개를 가져온다고 가정
    const q = query(classedCollectionRef, orderBy('createdAt', 'desc'), limit(6));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log("TodaysPicksList Snapshot received:", { empty: querySnapshot.empty, size: querySnapshot.size });
      const fetchedPicks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() // classifiedTopic, classifiedSummary, sessionIds 등 포함
      }));
      // --- 상세 로그 추가 ---
      console.log("TodaysPicksList Fetched Picks - Detailed Content:");
      fetchedPicks.forEach((pick, index) => console.log(`  Pick ${index}:`, pick));
      // --------------------
      console.log("TodaysPicksList Fetched Picks Data:", fetchedPicks);
      setPicksList(fetchedPicks);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching Today's Picks list:", err);
      setError(`Failed to load picks: ${err.code}`);
      setLoading(false);
    });

    // 컴포넌트 언마운트 시 리스너 정리
    return () => unsubscribe();

  }, [userId]); // userId 변경 시 리스너 재설정

  console.log("TodaysPicksList Rendering State:", { loading, error, picksCount: picksList.length });

  if (loading) {
    return (
      <Card title="Today's Picks">
        <Spin tip="Loading Today's Picks..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Today's Picks">
        <Text type="danger">Error: {error}</Text>
       </Card>
    );
  }

  if (picksList.length === 0) {
    return (
      <Card title="Today's Picks">
         <Text>No picks available for today.</Text>
       </Card>
    );
  }

  return (
    <Card title="Today's Picks">
      {picksList.map((pick, index) => {
        const mainResult = pick.results && pick.results.length > 0 ? pick.results[0] : null;
        const topic = mainResult ? mainResult.classifiedTopic : undefined;
        const summary = mainResult ? mainResult.classifiedSummary : undefined;
        const sIds = mainResult ? mainResult.sessionIds : [];

        return topic ? (
          <React.Fragment key={pick.id}>
            <TodaysPicks
              userId={userId}
              classifiedTopic={topic}
              classifiedSummary={summary}
              sessionIds={sIds}
            />
            {index < picksList.length - 1 && <Divider style={{ margin: '24px 0' }} />}
          </React.Fragment>
        ) : null;
      })}
    </Card>
  );
}

export default TodaysPicksList; 