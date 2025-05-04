import React, { useState, useEffect } from 'react';
import { Card, Space, Spin, Typography, Row, Col, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
// Firestore import 추가
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { getTodayDateString } from '../../utils/dateUtils'; // 날짜 형식 YYYY-MM-DD 확인됨

const { Title, Text } = Typography;

// 초를 "Xh Ym Zs" 형식으로 변환하는 헬퍼 함수 (변경 없음)
const formatSeconds = (totalSeconds) => {
    if (isNaN(totalSeconds) || totalSeconds === null || totalSeconds < 0) {
        return 'N/A';
    }
    if (totalSeconds === 0) {
        return '0s';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    let result = '';
    if (hours > 0) {
        result += `${hours}h `;
    }
    if (minutes > 0) {
        result += `${minutes}m `;
    }
    if (seconds > 0 || result === '') {
        result += `${seconds}s`;
    }
    return result.trim();
};

function Monitoring() {
    const { currentUser, loadingAuth } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [monitoringData, setMonitoringData] = useState({
        focusScore: null,
        averageFocus: null,
        maxFocus: null,
    });

    useEffect(() => {
        if (loadingAuth) {
            console.log("Monitoring: Auth is loading...");
            setLoading(true);
            return;
        }

        if (!currentUser) {
            setLoading(false);
            console.log("Monitoring: User not logged in after auth check.");
            setMonitoringData({ focusScore: null, averageFocus: null, maxFocus: null });
            setError(null);
            return;
        }

        console.log("Monitoring: Auth loaded, user found. Setting up Firestore listener...");
        setLoading(true);
        setError(null);
        // Firestore 인스턴스 가져오기
        const db = getFirestore();
        const userId = currentUser.uid;
        const todayDate = getTodayDateString(); // YYYY-MM-DD 형식

        // Firestore 문서 참조 생성
        const dailyLogDocRef = doc(db, `users/${userId}/dailylog/${todayDate}`);
        console.log("Monitoring: Listening to Firestore path:", dailyLogDocRef.path);

        // onSnapshot을 사용하여 실시간 리스너 설정
        const unsubscribe = onSnapshot(dailyLogDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log("Monitoring: Firestore data received:", data);
                setMonitoringData({
                    focusScore: data.latestFocusScore?.score,
                    averageFocus: data.dailyMetrics?.averageContinuousFocusSeconds,
                    maxFocus: data.dailyMetrics?.maxContinuousFocusSeconds,
                });
                setError(null);
            } else {
                console.log("Monitoring: No Firestore document found at path:", dailyLogDocRef.path);
                // 문서가 없을 때 데이터 초기화
                setMonitoringData({ focusScore: null, averageFocus: null, maxFocus: null });
                setError(null); // 데이터 없는 것은 에러가 아님
            }
            setLoading(false); // 데이터 처리 완료 후 로딩 상태 해제
        }, (errorObject) => {
            // 에러 처리
            console.error("Monitoring: Firestore listener error: ", errorObject);
            // Firestore 보안 규칙 관련 에러 메시지 확인
            if (errorObject.code === 'permission-denied') {
                 console.error("Firestore Permission Denied. Check security rules for path:", dailyLogDocRef.path);
                 setError("Permission denied fetching monitoring data.");
            } else {
                 setError("Failed to load monitoring data.");
            }
            setMonitoringData({ focusScore: null, averageFocus: null, maxFocus: null });
            setLoading(false); // 에러 시에도 로딩 상태 해제
        });

        // 컴포넌트 언마운트 시 리스너 해제
        return () => {
            console.log("Monitoring: Unsubscribing from Firestore listener for path:", dailyLogDocRef.path);
            unsubscribe();
        };

    }, [currentUser, loadingAuth]); // 의존성 배열 유지

    // renderMetric 함수는 이전과 동일
    const renderMetric = (title, value, unit = '', tooltip = '') => (
        <div style={{ textAlign: 'left' }}>
            <Space align="center" size="small">
                <Text type="secondary" style={{ fontSize: '14px', fontWeight: 500 }}>{title}</Text>
                {tooltip && (
                    <Tooltip title={tooltip}>
                        <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'help' }} />
                    </Tooltip>
                )}
            </Space>
            <Title level={4} style={{ margin: '4px 0 0 0', fontWeight: 600 }}>
                {loading ? <Spin size="small" /> : (value ?? 'N/A')}
                {!loading && value !== null && unit && <span style={{ fontSize: '16px', marginLeft: '4px', fontWeight: 500 }}>{unit}</span>}
            </Title>
        </div>
    );

    // 이하 return 문은 이전과 동일
    return (
        <Card title="Today's Monitoring" style={{ marginBottom: 0 }}>
            {error && <Text type="danger" style={{ display: 'block', marginBottom: '16px' }}>{error}</Text>}
            {!error && (
                <Row gutter={[16, 24]}>
                    <Col span={12}>
                        {renderMetric(
                            'Focus Score',
                            monitoringData.focusScore !== null ? Math.round(monitoringData.focusScore * 100) : null,
                            '%',
                            'Your focus level based on browsing patterns (0-100).'
                        )}
                    </Col>
                    <Col span={12}>
                         <div style={{ textAlign: 'left' }}>
                           <Space align="center" size="small">
                             <Text type="secondary" style={{ fontSize: '14px', fontWeight: 500 }}>Focus Score Trend</Text>
                                <Tooltip title="How your Focus Score changed throughout the day (coming soon).">
                                  <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'help' }} />
                                </Tooltip>
                           </Space>
                            <Text style={{ display: 'block', marginTop: '4px', color: loading ? '#bfbfbf' : (monitoringData.focusScore === null ? '#bfbfbf' : '#bfbfbf') }}>
                                {loading ? <Spin size="small" /> : 'Graph coming soon'}
                            </Text>
                         </div>
                    </Col>
                    <Col span={12}>
                        {renderMetric(
                            'Average Focus',
                            formatSeconds(monitoringData.averageFocus),
                            '',
                            'Average time spent focused on a single topic.'
                        )}
                    </Col>
                    <Col span={12}>
                         {renderMetric(
                            'Max Focus',
                             formatSeconds(monitoringData.maxFocus),
                             '',
                            'Longest uninterrupted time spent focused on a single topic today.'
                         )}
                    </Col>
                </Row>
            )}
             {!loading && !error && monitoringData.focusScore === null && monitoringData.averageFocus === null && monitoringData.maxFocus === null && (
                <Text type="secondary">No monitoring data available for today yet.</Text>
             )}
        </Card>
    );
}

export default Monitoring;