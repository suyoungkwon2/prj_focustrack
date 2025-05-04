import React, { useState, useEffect } from 'react';
import { Card, Space, Spin, Typography, Row, Col } from 'antd';
// Firestore import 추가
import { getFirestore, doc, onSnapshot, Timestamp, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { getTodayDateString } from '../../utils/dateUtils'; // 날짜 형식 YYYY-MM-DD 확인됨
// Recharts import 수정: TinyLineChart 대신 LineChart 사용
import { ResponsiveContainer, LineChart, Tooltip as RechartsTooltip, Line as RechartsLine } from 'recharts';
// date-fns import 유지
import { subDays, addDays } from 'date-fns';
// dayjs import 추가
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc'; // UTC 플러그인
import timezone from 'dayjs/plugin/timezone'; // 타임존 플러그인

// dayjs 플러그인 활성화
dayjs.extend(utc);
dayjs.extend(timezone);

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

// Recharts Tooltip 커스텀 컨텐츠 (밖으로 빼서 재선언 방지)
const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ backgroundColor: 'white', border: '1px solid #ccc', padding: '5px' }}>
                <p style={{ margin: 0 }}>{`${payload[0].payload.time}: ${payload[0].value}%`}</p>
            </div>
        );
    }
    return null;
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
    // Trend Graph State
    const [trendData, setTrendData] = useState([]);
    const [loadingTrend, setLoadingTrend] = useState(true);
    const [errorTrend, setErrorTrend] = useState(null);

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

    // Effect for Focus Score Trend data
    useEffect(() => {
        if (loadingAuth || !currentUser) {
            setLoadingTrend(loadingAuth);
            if (!currentUser && !loadingAuth) setTrendData([]);
            return;
        }

        setLoadingTrend(true);
        setErrorTrend(null);

        const fetchTrendData = async () => {
            // date-fns-tz 동적 import 및 관련 코드 제거
            try {
                const db = getFirestore();
                const userId = currentUser.uid;
                const timeZone = 'America/New_York';

                // Calculate 5 AM ET cycle boundaries using dayjs
                const now = dayjs(); // 현재 시간 dayjs 객체
                const nowET = now.tz(timeZone); // 현재 시간을 ET로 변환

                let cycleStartDateET = nowET.hour(5).minute(0).second(0).millisecond(0);

                if (nowET.isBefore(cycleStartDateET)) {
                    cycleStartDateET = cycleStartDateET.subtract(1, 'day');
                }
                // dayjs 객체는 불변(immutable)이므로, add는 새로운 객체를 반환
                const cycleEndDateET = cycleStartDateET.add(1, 'day');

                // Firestore Timestamp 로 변환
                const cycleStartTimestamp = Timestamp.fromDate(cycleStartDateET.toDate());
                const cycleEndTimestamp = Timestamp.fromDate(cycleEndDateET.toDate());

                console.log(`Monitoring Trend: Fetching data between ${cycleStartDateET.toISOString()} ET and ${cycleEndDateET.toISOString()} ET`);
                console.log(`Monitoring Trend: Querying between ${cycleStartTimestamp.toDate().toISOString()} UTC and ${cycleEndTimestamp.toDate().toISOString()} UTC`);

                const focusScoreCollectionRef = collection(db, `users/${userId}/FocusScore`);
                const q = query(
                    focusScoreCollectionRef,
                    where('calculatedAt', '>=', cycleStartTimestamp),
                    where('calculatedAt', '<', cycleEndTimestamp),
                    orderBy('calculatedAt', 'asc')
                );

                const querySnapshot = await getDocs(q);
                const fetchedData = querySnapshot.docs.map(doc => {
                    const docData = doc.data();
                    const jsDate = docData.calculatedAt?.toDate();
                    if (!jsDate) return null;

                    // dayjs를 사용하여 시간 포맷팅
                    const timeString = dayjs(jsDate).tz(timeZone).format('HH:mm');

                    const score = docData.focusScore !== null && docData.focusScore !== undefined
                                    ? Math.round(docData.focusScore * 100)
                                    : null;
                    return score !== null ? { time: timeString, value: score, timestamp: jsDate } : null;
                }).filter(item => item !== null);

                fetchedData.sort((a, b) => a.timestamp - b.timestamp);
                console.log("Monitoring Trend: Fetched data points:", fetchedData.length);
                setTrendData(fetchedData);

            } catch (error) {
                console.error("Monitoring Trend: Error fetching data: ", error);
                setErrorTrend("Failed to load focus score trend."); // 일반 에러 메시지
                setTrendData([]);
            } finally {
                setLoadingTrend(false);
            }
        };

        fetchTrendData();
    }, [currentUser, loadingAuth]);

    // renderMetric 수정: type="secondary" 제거
    const renderMetric = (title, value, unit = '') => (
        <div style={{ textAlign: 'left' }}>
            <Space align="center" size="small">
                <Text style={{ fontSize: '14px', fontWeight: 500 }}>{title}</Text>
            </Space>
            <Title level={4} style={{ margin: '4px 0 0 0', fontWeight: 600 }}>
                {loading ? <Spin size="small" /> : (value ?? 'N/A')}
                {!loading && value !== null && unit && <span style={{ fontSize: '16px', marginLeft: '4px', fontWeight: 500 }}>{unit}</span>}
            </Title>
        </div>
    );

    return (
        <Card title="Focus Metrics" style={{ marginBottom: 0 }}>
            {error && <Text type="danger" style={{ display: 'block', marginBottom: '16px' }}>{error}</Text>}
            {!error && (
                <Row gutter={[16, 16]}>
                    <Col span={12}>
                        {renderMetric(
                            '💯 Focus Score',
                            monitoringData.focusScore !== null ? Math.round(monitoringData.focusScore * 100) : null,
                            '%'
                        )}
                    </Col>
                    <Col span={12}>
                         {renderMetric(
                            '⏰ Max Focus',
                             formatSeconds(monitoringData.maxFocus),
                             ''
                         )}
                    </Col>
                     <Col span={12}>
                        {renderMetric(
                            '⏰ Average Focus',
                            formatSeconds(monitoringData.averageFocus),
                            ''
                        )}
                    </Col>
                     <Col span={12}>
                       <div style={{ textAlign: 'left' }}>
                            <Space align="center" size="small">
                                <Text style={{ fontSize: '14px', fontWeight: 500 }}>💯 Focus Score Trend</Text>
                            </Space>
                             <div style={{ marginTop: '4px', height: '105px' }}>
                                {loadingTrend ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin /></div>
                                ) : errorTrend ? (
                                    <Text type="danger">{errorTrend}</Text>
                                ) : trendData.length > 1 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={trendData}
                                            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                                            >
                                            <RechartsTooltip content={<CustomTooltip />} />
                                            <RechartsLine 
                                                type="monotone" 
                                                dataKey="value" 
                                                stroke="#8884d8" 
                                                strokeWidth={2} 
                                                dot={false}
                                                isAnimationActive={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <Text type="secondary">{trendData.length <= 1 ? 'Need more data for trend.' : 'No trend data available.'}</Text>
                                )}
                            </div>
                        </div>
                    </Col>
                </Row>
            )}
             {!loading && !loadingTrend && !error && !errorTrend && monitoringData.focusScore === null && monitoringData.averageFocus === null && monitoringData.maxFocus === null && trendData.length === 0 && (
                <Text type="secondary">No monitoring data available for today yet.</Text>
             )}
        </Card>
    );
}

export default Monitoring;