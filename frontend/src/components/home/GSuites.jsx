import React from 'react';
import { Card, Row, Col, Tooltip } from 'antd';

const gSuitesData = [
  { name: 'Calendar', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/calendar_2020q4/v13/192px.svg', url: 'https://calendar.google.com' },
  { name: 'Mail', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/gmail_2020q4/v11/192px.svg', url: 'https://mail.google.com' },
  { name: 'Drive', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/drive_2020q4/v10/192px.svg', url: 'https://drive.google.com' },
  { name: 'Meet', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/meet_2020q4/v8/192px.svg', url: 'https://meet.google.com' },
  { name: 'Sheets', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/sheets_2020q4/v11/192px.svg', url: 'https://sheets.google.com' },
  { name: 'Docs', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/docs_2020q4/v12/192px.svg', url: 'https://docs.google.com' },
  { name: 'Slides', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/slides_2020q4/v12/192px.svg', url: 'https://slides.google.com' },
  { name: 'Forms', iconUrl: 'https://www.gstatic.com/images/branding/productlogos/forms_2020q4/v6/192px.svg', url: 'https://forms.google.com' },
];

const iconStyle = {
  width: '32px',
  height: '32px',
  verticalAlign: 'middle',
};

const linkStyle = {
  display: 'inline-block',
  padding: '10px',
};

function GSuites() {
  return (
    <Card title="G-Suites" style={{ marginBottom: 0 }}>
      <Row gutter={[16, 16]}>
        {gSuitesData.map((suite) => (
          <Col span={6} key={suite.name} style={{ textAlign: 'center' }}>
            <Tooltip title={suite.name}>
              <a
                href={suite.url}
                target="_self"
                style={linkStyle}
              >
                <img src={suite.iconUrl} alt={suite.name} style={iconStyle} />
              </a>
            </Tooltip>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

export default GSuites; 