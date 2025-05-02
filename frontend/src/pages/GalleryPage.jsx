import React, { useState, useEffect } from 'react';
import { Select, Row, Col, Card, Image, Typography, Spin, Empty, Space, Tag } from 'antd';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config'; // Firebase 설정 확인
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs'; // dayjs 추가

const { Text } = Typography;

// 색상 정의 업데이트
const colors = {
  Growth: '#99DAFF',
  DailyLife: '#FFDDAD',
  Entertainment: '#FFD6E8',
  Image: '#AFA6EA',   // 색상 변경
  Youtube: '#FF8C8C', // 색상 변경
  default: '#E8E8E8'
};

// 카테고리 옵션 수정 (All 추가)
const categoryOptions = [
  { value: 'All Categories', label: 'All Categories' },
  { value: 'Growth', label: 'Growth' },
  { value: 'DailyLife', label: 'Daily Life' },
  { value: 'Entertainment', label: 'Entertain' },
];

// 미디어 타입 옵션 수정
const mediaOptions = [
  { value: 'All Media', label: 'All Media' },
  { value: 'Image', label: 'Image' },
  { value: 'Youtube', label: 'Youtube' },
];

// --- Helper Function: 유튜브 썸네일 URL 생성 ---
const getYoutubeThumbnailUrl = (youtubeUrl) => {
  try {
    const url = new URL(youtubeUrl);
    const videoId = url.searchParams.get('v');
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
  } catch (e) {
    console.error("Error parsing YouTube URL:", youtubeUrl, e);
  }
  return null;
};
// ---------------------------------------------

// --- 칩 렌더링 함수 ---
const renderChip = (type, value) => {
  let color = colors.default;
  if (type === 'category' && colors[value]) {
    color = colors[value];
  } else if (type === 'media' && colors[value]) {
    color = colors[value];
  }
  return (
    <Tag bordered={false} color={color} style={{ borderRadius: '10px', margin: '0 0 0 4px', color: '#000000' }}>
      {value}
    </Tag>
  );
};
// -----------------------

// --- Select 필터 칩 렌더러 ---
const tagRender = (props) => {
  const { label, value, closable, onClose } = props;
  let color = colors.default;
  // 값으로 색상 찾기 (옵션 목록 전체를 확인하는 대신 직접 매핑)
  if (colors[value]) {
      color = colors[value];
  } else if (value === 'All Categories' || value === 'All Media') {
      // 기본값에 대한 스타일 (선택 사항)
  }

  const onPreventMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <Tag
      color={color}
      onMouseDown={onPreventMouseDown}
      closable={closable}
      onClose={onClose}
      style={{ marginRight: 3, borderRadius: '10px' }}
    >
      {label}
    </Tag>
  );
};
// ---------------------------

function GalleryPage() {
  const { currentUser } = useAuth();
  const [galleryData, setGalleryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [mediaFilter, setMediaFilter] = useState('All Media');

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
        const twoWeeksAgoMillis = dayjs().subtract(14, 'day').startOf('day').valueOf();
        q = query(q, where('endTime', '>=', twoWeeksAgoMillis));

        // 2. 카테고리 필터링
        if (categoryFilter !== 'All Categories') {
          q = query(q, where('summaryCategory', '==', categoryFilter));
        }

        // 3. 정렬 (endTime 기준 내림차순)
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
          const sessionEndTime = typeof data.endTime === 'number' ? data.endTime : data.endTime?.toDate ? data.endTime.toDate().getTime() : 0;
          const formattedDate = sessionEndTime ? dayjs(sessionEndTime).format('YYYY-MM-DD') : 'N/A';

          // 이미지 처리
          if (data.images && Array.isArray(data.images) && data.images.length > 0) {
             data.images.forEach((imageObj, index) => {
                if (imageObj && typeof imageObj.url === 'string') {
                  fetchedMedia.push({
                    id: `${doc.id}-${index}-img`,
                    type: 'Image',
                    docId: doc.id,
                    originalUrl: data.url,
                    mediaUrl: imageObj.url,
                    dateMillis: sessionEndTime, // 정렬 위한 밀리초 추가
                    date: formattedDate,
                    category: data.summaryCategory || 'N/A'
                  });
                }
             });
          }

          // 유튜브 처리
          if (data.url && data.url.startsWith('https://www.youtube.com/watch') && data.summaryCategory) {
             const thumbnailUrl = getYoutubeThumbnailUrl(data.url);
             if (thumbnailUrl) {
                fetchedMedia.push({
                    id: `${doc.id}-yt`,
                    type: 'Youtube',
                    docId: doc.id,
                    originalUrl: data.url,
                    mediaUrl: thumbnailUrl,
                    dateMillis: sessionEndTime, // 정렬 위한 밀리초 추가
                    date: formattedDate,
                    category: data.summaryCategory
                });
             }
          }
        });

        // 클라이언트 측에서 날짜로 다시 정렬 (이미지와 유튜브 통합)
        fetchedMedia.sort((a, b) => b.dateMillis - a.dateMillis);

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
      {/* 필터와 그리드를 감싸는 중앙 정렬 div */}
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* 필터 영역을 이 안으로 이동 */}
        <Space wrap style={{ marginBottom: '24px' }}>
          <Text>Category:</Text>
          <Select
            value={categoryFilter}
            placeholder="Category"
            style={{ width: 150 }}
            onChange={setCategoryFilter}
            options={categoryOptions}
            // tagRender={tagRender} // 스킵
          />
          <Text>Media:</Text>
          <Select
            value={mediaFilter}
            placeholder="Media"
            style={{ width: 120 }}
            onChange={setMediaFilter}
            options={mediaOptions}
            // tagRender={tagRender} // 스킵
          />
        </Space>

        {/* 그리드 영역 */}
        {loading && <Spin tip="Loading gallery..." size="large" style={{ display: 'block', marginTop: '50px' }} />}
        {!loading && error && <Text type="danger">Error: {error}</Text>}
        {!loading && !error && galleryData.length === 0 && <Empty description="No media found for the selected criteria." />}

        {!loading && !error && galleryData.length > 0 && (
          <Row gutter={[16, 16]}>
            {galleryData.map((item) => {
              const imageContainerHeight = 150;
              const imageContainerWidth = Math.round(imageContainerHeight * 16 / 9);
              const imageContainerStyle = {
                height: `${imageContainerHeight}px`,
                // width: '100%', // Col 너비에 맞춤 -> 고정 너비로 변경
                width: `${imageContainerWidth}px`, // 너비 고정
                // maxWidth: `${imageContainerWidth}px`, // 너비 고정 시 필요 없음
                margin: '0 auto', // 컨테이너 내부 중앙 정렬
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: '#f0f0f0',
                // border: '1px solid rgba(0, 0, 0, 0.06)', // 테두리 제거
              };

              return (
                <Col key={item.id} xs={12} sm={8} md={6} lg={6}>
                  <Card
                    hoverable
                    // style={{ borderRadius: '2px' }} // 카드 모서리 둥글게
                    style={{ borderRadius: '2px', border: '1px solid rgba(0, 0, 0, 0.06)' }} // 테두리 여기에 추가
                    bodyStyle={{ padding: 0 }}
                  >
                    <a href={item.originalUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                       <div style={imageContainerStyle}>
                         <Image
                           alt={`Gallery ${item.type}`}
                           src={item.mediaUrl}
                           style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                           preview={false}
                           fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkqAcAAIUAgUW0RjgAAAAASUVORK5CYII="
                         />
                       </div>
                    </a>
                    <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                       <Text type="secondary">{item.date}</Text>
                       <Space size={4}>
                         {item.category !== 'N/A' && renderChip('category', item.category)}
                         {renderChip('media', item.type)}
                       </Space>
                     </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </div>
    </div>
  );
}

export default GalleryPage; 