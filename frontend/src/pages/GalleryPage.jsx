import React, { useState, useEffect } from 'react';
import { Select, Row, Col, Card, Image, Typography, Spin, Empty, Space } from 'antd';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config'; // Firebase 설정 확인
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs'; // dayjs 추가

const { Text } = Typography;

// 카테고리 옵션 수정 (All 추가)
const categoryOptions = [
  { value: 'All Categories', label: 'All Categories' }, // 기본값
  { value: 'Growth', label: 'Growth' },
  { value: 'DailyLife', label: 'Daily Life' },
  { value: 'Entertainment', label: 'Entertainment' },
];

// 미디어 타입 옵션 추가
const mediaOptions = [
  { value: 'All Media', label: 'All Media' }, // 기본값
  { value: 'Image', label: 'Image' },
  // { value: 'Youtube', label: 'Youtube' }, // 추후 추가
];

function GalleryPage() {
  const { currentUser } = useAuth();
  const [galleryData, setGalleryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('All Categories'); // 기본값 변경
  const [mediaFilter, setMediaFilter] = useState('All Media'); // 미디어 필터 상태 추가

  useEffect(() => {
    // --- 로그 추가: useEffect 시작 및 사용자 확인 ---
    console.log("GalleryPage useEffect triggered. currentUser:", currentUser?.uid);
    // ---------------------------------------------
    if (!currentUser) {
      setLoading(false);
      setError("Please log in to view the gallery.");
      setGalleryData([]);
      return;
    }

    setLoading(true);
    setError(null);

    const fetchData = async () => {
      try {
        const sessionsRef = collection(db, 'users', currentUser.uid, 'focusSessions');
        let q = query(sessionsRef);

        // 1. 날짜 필터링 (endTime 숫자 타입 기준으로 최근 14일)
        const twoWeeksAgo = dayjs().subtract(14, 'day').startOf('day');
        // const twoWeeksAgoTimestamp = Timestamp.fromDate(twoWeeksAgo.toDate()); // Timestamp 객체 대신 숫자 사용
        const twoWeeksAgoMillis = twoWeeksAgo.valueOf(); // 밀리초 타임스탬프(숫자) 가져오기
        // q = query(q, where('endTime', '>=', twoWeeksAgoTimestamp));
        q = query(q, where('endTime', '>=', twoWeeksAgoMillis)); // 숫자로 비교

        // 2. 카테고리 필터링
        if (categoryFilter !== 'All Categories') {
          q = query(q, where('summaryCategory', '==', categoryFilter));
        }

        // (추후 구현) 3. 미디어 타입 필터링
        // if (mediaFilter !== 'All Media') {
        //   if (mediaFilter === 'Image') {
        //     // images 필드가 존재하거나 특정 조건을 만족하는 쿼리 (Firestore 제한 고려 필요)
        //     // 예: q = query(q, where('hasImages', '==', true)); // 별도 필드 필요 가능성
        //   } else if (mediaFilter === 'Youtube') {
        //     // youtube 관련 필드 쿼리
        //   }
        // }

        // 3. 정렬
        q = query(q, orderBy('endTime', 'desc'));

        // --- 로그 추가: Firestore 쿼리 확인 ---
        console.log("GalleryPage Firestore Query:", q); // 쿼리 객체 자체 로깅 (세부 정보는 콘솔에서 확인 어려울 수 있음)
        // --------------------------------------

        // 4. 데이터 가져오기
        const querySnapshot = await getDocs(q);
        // --- 로그 추가: 스냅샷 결과 확인 ---
        console.log("GalleryPage Snapshot received:", { empty: querySnapshot.empty, size: querySnapshot.size });
        // -----------------------------------
        const fetchedMedia = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // --- 로그 추가: 개별 문서 데이터 확인 ---
          // console.log(` Doc ID: ${doc.id}`, data); // 데이터가 많을 수 있으므로 필요 시 주석 해제
          // -------------------------------------
          if (data.images && Array.isArray(data.images) && data.images.length > 0) {
             data.images.forEach((imageObj, index) => { // 변수명을 imageUrl -> imageObj 로 변경
                // if (typeof imageUrl === 'string') { // 문자열 검사 대신 객체와 url 필드 존재 확인
                if (imageObj && typeof imageObj.url === 'string') {
                  fetchedMedia.push({
                    id: `${doc.id}-${index}-img`,
                    type: 'Image',
                    docId: doc.id,
                    originalUrl: data.url,
                    // mediaUrl: imageUrl,
                    mediaUrl: imageObj.url, // imageObj.url 사용
                    date: data.endTime?.toDate ? dayjs(data.endTime.toDate()).format('YYYY-MM-DD') : (typeof data.endTime === 'number' ? dayjs(data.endTime).format('YYYY-MM-DD') : 'N/A'), // endTime 타입 고려
                    category: data.summaryCategory || 'N/A'
                  });
                }
             });
          }

          // (추후 구현) 유튜브 등 다른 미디어 처리
          // if (mediaFilter === 'All Media' || mediaFilter === 'Youtube') {
          //    // 유튜브 데이터 처리 로직
          // }
        });

        // --- 로그 추가: Fetch 후 미디어 데이터 확인 ---
        console.log("GalleryPage Fetched Media (before media filter):", fetchedMedia);
        // -------------------------------------------

        // 미디어 타입에 따라 최종 필터링
        const finalFilteredData = fetchedMedia.filter(item =>
            mediaFilter === 'All Media' || item.type === mediaFilter
        );

        // --- 로그 추가: 최종 필터링 후 데이터 확인 ---
        console.log("GalleryPage Final Data (after media filter):", finalFilteredData);
        // -------------------------------------------

        setGalleryData(finalFilteredData);

      } catch (err) {
        console.error("Error fetching gallery data:", err);
        setError(`Failed to load gallery: ${err.message}`);
        setGalleryData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

  }, [currentUser, categoryFilter, mediaFilter]); // 의존성 배열 변경: dateRange 제거, mediaFilter 추가

  // --- 로그 추가: 렌더링 상태 확인 ---
  console.log("GalleryPage Rendering State:", { loading, error, galleryDataCount: galleryData.length });
  // -----------------------------------

  return (
    <div>
      <h1>Gallery</h1>
      <Space wrap style={{ marginBottom: '24px' }}>
         {/* 필터 영역 */}
        <Text>Filter</Text>
        <Text>Category:</Text>
        <Select
          value={categoryFilter}
          placeholder="Category" // Placeholder 추가
          style={{ width: 150 }} // 너비 조정
          onChange={setCategoryFilter}
          options={categoryOptions}
        />
        <Text>Media:</Text>
        <Select
          value={mediaFilter}
          placeholder="Media" // Placeholder 추가
          style={{ width: 120 }}
          onChange={setMediaFilter}
          options={mediaOptions}
        />
      </Space>

      {/* 이미지 그리드 영역 */}
      {loading && <Spin tip="Loading gallery..." size="large" style={{ display: 'block', marginTop: '50px' }} />}
      {!loading && error && <Text type="danger">Error: {error}</Text>}
      {!loading && !error && galleryData.length === 0 && <Empty description="No media found for the selected criteria." />}

      {!loading && !error && galleryData.length > 0 && (
        <Row gutter={[16, 16]}> 
          {galleryData.map((item) => (
            <Col key={item.id} xs={12} sm={8} md={6} lg={6}>
              <Card
                hoverable
                cover={
                  <a href={item.originalUrl} target="_blank" rel="noopener noreferrer">
                     {/* 이미지 렌더링 (추후 타입별 렌더링 분기) */}
                     {item.type === 'Image' && (
                       <Image
                         alt="Gallery image"
                         src={item.mediaUrl}
                         style={{ height: 150, objectFit: 'cover', width: '100%' }}
                         preview={false}
                       />
                     )}
                     {/* {item.type === 'Youtube' && ( ... 유튜브 썸네일 등 ... )} */}
                  </a>
                }
                bodyStyle={{ padding: '12px' }}
              >
                <Card.Meta
                  description={item.date}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

export default GalleryPage; 