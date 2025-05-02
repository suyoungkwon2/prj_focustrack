import React, { useState, useEffect } from 'react';
import { Card, Avatar, Typography, Empty, Row, Col, Tooltip } from 'antd';

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

    // Row와 Col을 사용한 2열 레이아웃
    return (
      <Row gutter={[16, 16]}> {/* gutter로 아이템 간 간격 조정 */}
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

          const displayTitle = truncateTitle(originalTitle, 10); // 10자로 줄이기

          return (
            // 각 아이템을 Col로 감싸고 span={12}로 설정하여 2열 만듦
            <Col span={12} key={site.url}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Avatar
                  src={`https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(site.url)}`}
                  style={{ marginRight: '12px' }} // 아이콘과 텍스트 간격
                />
                {/* Tooltip으로 전체 제목 표시 */}
                <Tooltip title={originalTitle}>
                  {/* target="_self" 유지 */}
                  <Link href={site.url} target="_self" style={{ color: 'inherit' }}>
                    {displayTitle}
                  </Link>
                </Tooltip>
              </div>
            </Col>
          );
        })}
      </Row>
    );
  };

  return (
    <Card title="Frequently Visited Sites" style={{ marginBottom: '24px' }}>
      {renderContent()}
    </Card>
  );
}

export default FrequentlyVisitedSites; 