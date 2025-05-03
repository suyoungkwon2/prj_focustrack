import React from 'react';
import { Typography, Space } from 'antd'; // Ant Design 컴포넌트 활용

const { Title, Paragraph } = Typography;

function HistoryPage() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', maxWidth: '1200px', margin: 'auto' }}>
      <Title level={2}>Coming Soon 🚀</Title>
      <Space direction="vertical" size="large" style={{ margin: 'auto' }}>
        <Paragraph style={{ fontSize: '16px', color: '#555' }}>
          We're currently working on this feature and can't wait to share it with you.
          <br />
          In the meantime, we'd love your thoughts and feedback.
        </Paragraph>
        <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
          <iframe
            src="https://docs.google.com/forms/d/e/1FAIpQLSdcz4nMwd_ePFvAJMlQWACO-nEBO0IvqHoWkYDttlggtFCTqA/viewform?embedded=true"
            width="100%"
            height="1200"
            frameBorder="0"
            allowFullScreen
            title="Feedback Form" // Accessibility improvement
            style={{ display: 'block' }} // Prevent extra space below iframe
          />
        </div>
      </Space>
    </div>
  );
}

export default HistoryPage; 