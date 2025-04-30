import React from 'react';
import { Card } from 'antd';

function SmartAlerts() {
  // TODO: 조건부 렌더링 로직 추가
  const showAlert = true; // 임시로 항상 보이도록 설정

  if (!showAlert) {
    return null;
  }

  return (
    <Card title="Want to refocus?" style={{ marginBottom: '24px', backgroundColor: '#fffbe6', borderColor: '#ffe58f' }}>
      {/* Smart Alerts 내용 Placeholder */}
      <p>High entertainment time detected. Consider shifting your focus to priority tasks.</p>
    </Card>
  );
}
export default SmartAlerts; 