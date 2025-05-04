import React, { useState, useEffect } from 'react';
import { Card, Avatar, Typography, Empty, Tooltip, Spin } from 'antd';

const { Text, Link } = Typography;

// Chrome API 사용 가능 여부 확인 (개발 환경에서는 없을 수 있음)
const isChromeApiAvailable = typeof chrome !== 'undefined' && chrome.topSites;

function FrequentlyVisitedSites() {
  const [topSites, setTopSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isChromeApiAvailable) {
      console.warn('chrome.topSites API is not available. Mock data might be needed for development outside extension context.');
      setLoading(false);
      // 개발 편의를 위해 목업 데이터 추가 가능
      // setTopSites([{ url: 'https://google.com', title: 'Google' }, /* ... */ ]);
      return;
    }

    chrome.topSites.get((sites) => {
      // console.log("Top sites fetched:", sites); // 디버깅용 로그
      if (chrome.runtime.lastError) {
        console.error("Error fetching top sites:", chrome.runtime.lastError.message);
        setError(chrome.runtime.lastError.message);
        setLoading(false);
        return;
      }
      // 상위 6개 사이트만 사용
      setTopSites(sites.slice(0, 6));
      setLoading(false);
    });

  }, []); // 컴포넌트 마운트 시 한 번만 실행

  // 제목 줄임 함수
  const truncateTitle = (title, maxLength = 10) => {
    if (!title) return '';
    if (title.length <= maxLength) {
      return title;
    }
    return title.substring(0, maxLength) + '...';
  };

  const renderContent = () => {
    if (loading) {
      return <p>Loading...</p>;
    }
    if (error) {
      return <p>Error loading sites: {error}</p>;
    }
    if (topSites.length === 0) {
      return <Empty description="No frequently visited sites found." image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    // Row와 Col을 사용한 2열 레이아웃 제거하고 1열로 변경
    return (
      <div> {/* Row 제거, 단순 div로 감싸기 */}
        {topSites.map((site) => {
          let originalTitle = site.title;
          let hostname = '';
          try {
            const urlObj = new URL(site.url);
            hostname = urlObj.hostname;
            if (!originalTitle) {
              originalTitle = hostname; // 제목 없으면 호스트 이름 사용
            }
          } catch (e) {
            console.error("Invalid URL:", site.url);
            originalTitle = site.url || 'Invalid URL'; // URL이라도 표시
          }

          const displayTitle = truncateTitle(originalTitle, 18); // 10자로 줄이기

          return (
            // 각 아이템을 div로 감싸고 스타일 적용 (Col 제거)
            <div key={site.url} style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}> {/* marginBottom으로 아이템 간 수직 간격 추가 */}
              <Avatar
                src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`}
                style={{ marginRight: '12px' }}
                alt={`${originalTitle} Favicon`}
              />
              {/* Tooltip으로 전체 제목 표시 */}
              <Tooltip title={originalTitle}>
                {/* target="_self" 유지 */}
                <Link href={site.url} target="_self" style={{ color: 'inherit' }}>
                  {displayTitle}
                </Link>
              </Tooltip>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card title="Frequently Visited Sites" style={{ marginBottom: 0 }}>
      {loading && <Spin />}
      {renderContent()}
    </Card>
  );
}

export default FrequentlyVisitedSites; 