import React, { useState, useEffect } from 'react';
import { Spin, Typography } from 'antd';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config'; // Firebase 설정 확인
import TodaysPicks from './TodaysPicks'; // 개별 Pick 컴포넌트

const { Text } = Typography;

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
+      // --- 상세 로그 추가 ---
+      console.log("TodaysPicksList Fetched Picks - Detailed Content:");
+      fetchedPicks.forEach((pick, index) => console.log(`  Pick ${index}:`, pick));
+      // --------------------
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
    return <Spin tip="Loading Today's Picks..." />;
  }

  if (error) {
    return <Text type="danger">Error: {error}</Text>;
  }

  if (picksList.length === 0) {
    return <Text>No picks available for today.</Text>;
  }

  return (
    <div>
      {picksList.map(pick => {
        // results 배열의 첫 번째 요소에서 데이터를 추출
        // results 배열이 존재하고, 비어있지 않으며, 필요한 필드가 있는지 확인
        const mainResult = pick.results && pick.results.length > 0 ? pick.results[0] : null;
        const topic = mainResult ? mainResult.classifiedTopic : undefined;
        const summary = mainResult ? mainResult.classifiedSummary : undefined; // 요약도 가져올 수 있음 (필요하다면)
        const sIds = mainResult ? mainResult.sessionIds : [];

        // 데이터가 유효한 경우에만 TodaysPicks 렌더링 (예: topic이 있는 경우)
        return topic ? (
          <TodaysPicks
          key={pick.id}
          userId={userId}
          classifiedTopic={topic}
          classifiedSummary={summary} // summary prop 추가 (TodaysPicks 컴포넌트에서도 받아야 함)
          sessionIds={sIds}
        />
        ) : null; // topic이 없으면 렌더링하지 않음
      })}
    </div>
  );
}

export default TodaysPicksList; 