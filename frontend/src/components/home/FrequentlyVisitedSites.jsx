import React, { useState, useEffect } from 'react';
import { Card, List, Avatar, Typography, Empty } from 'antd';

const { Text } = Typography;

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

    return (
      <List
        itemLayout="horizontal"
        dataSource={topSites}
        renderItem={(site) => {
          let displayTitle = site.title;
          let hostname = '';
          try {
            hostname = new URL(site.url).hostname;
            if (!displayTitle) {
              displayTitle = hostname; // 제목 없으면 호스트 이름 사용
            }
          } catch (e) {
            console.error("Invalid URL:", site.url);
            displayTitle = displayTitle || 'Invalid URL';
          }

          return (
            <List.Item>
              <List.Item.Meta
                // chrome://favicon/ 대신 Google S2 Favicon 서비스 사용
                avatar={<Avatar src={`https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(site.url)}`} />}
                title={<a href={site.url} target="_self" title={site.url}>{displayTitle}</a>}
              />
            </List.Item>
          );
        }}
      />
    );
  };

  return (
    <Card title="Frequently Visited Sites" style={{ marginBottom: '24px' }}>
      {renderContent()}
    </Card>
  );
}

export default FrequentlyVisitedSites; 