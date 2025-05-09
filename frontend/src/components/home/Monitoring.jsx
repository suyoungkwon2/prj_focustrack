import React, { useState, useEffect } from 'react';
import { Card, Space, Spin, Typography, Row, Col, Divider } from 'antd';
// Firestore import 추가
import { getFirestore, doc, onSnapshot, Timestamp, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { getTodayDateString } from '../../utils/dateUtils'; // 날짜 형식 YYYY-MM-DD 확인됨
// Recharts import 수정: XAxis 추가
import { ResponsiveContainer, LineChart, Tooltip as RechartsTooltip, Line as RechartsLine, XAxis } from 'recharts';
// date-fns import 유지
import { subDays, addDays } from 'date-fns';
// dayjs import 추가
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc'; // UTC 플러그인
import timezone from 'dayjs/plugin/timezone'; // 타임존 플러그인
import isBetween from 'dayjs/plugin/isBetween'; // isBetween 플러그인 추가
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'; // isSameOrBefore 플러그인 import 추가

// dayjs 플러그인 활성화
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween); // isBetween 활성화
dayjs.extend(isSameOrBefore); // isSameOrBefore 활성화 추가

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

// Recharts Tooltip 커스텀 컨텐츠 수정
const CustomTooltip = ({ active, payload, label }) => {
    // label은 X축 값 (타임스탬프)
    if (active && payload && payload.length && label) {
        // MM/DD HH:mm 형식으로 시간 표시 (ET 기준)
        const pointTime = dayjs(label).tz('America/New_York').format('MM/DD HH:mm');

        return (
            <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #ccc', padding: '10px', fontSize: '12px' }}>
                 <p style={{ margin: 0, marginBottom: '5px', fontWeight: 'bold' }}>{pointTime}</p>
                 {payload.map((pld, index) => {
                    // pld.name 은 "Today" 또는 "Yesterday"
                    // pld.value 는 점수, 없으면 null/undefined
                    const valueDisplay = pld.value !== null && pld.value !== undefined ? `${pld.value}%` : 'N/A';
                    return (
                        <p key={index} style={{ margin: 0, color: pld.stroke }}>
                            <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: pld.stroke, marginRight: '5px' }}></span>
                            {pld.name}: {valueDisplay}
                        </p>
                    );
                 })}
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
    // Trend Graph State - 오늘/어제 데이터 분리
    const [trendData, setTrendData] = useState([]);
    const [yesterdayTrendData, setYesterdayTrendData] = useState([]); // 어제 데이터 상태 추가
    const [loadingTrend, setLoadingTrend] = useState(true);
    const [errorTrend, setErrorTrend] = useState(null);
    // X축 도메인 상태 추가
    const [xAxisDomain, setXAxisDomain] = useState([0, 0]);
    const [xAxisTicks, setXAxisTicks] = useState([]);

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

    // Effect for Focus Score Trend data (Today & Yesterday)
    useEffect(() => {
        if (loadingAuth || !currentUser) {
            setLoadingTrend(loadingAuth);
            if (!currentUser && !loadingAuth) {
                setTrendData([]);
                setYesterdayTrendData([]); // 어제 데이터도 초기화
            }
            return;
        }

        setLoadingTrend(true);
        setErrorTrend(null);

        const fetchTrendData = async () => {
            try {
                const db = getFirestore();
                const userId = currentUser.uid;
                const timeZone = 'America/New_York';

                // --- 날짜 계산 (5AM ET 기준) ---
                const now = dayjs();
                const nowET = now.tz(timeZone);
                let todayCycleStartDateET = nowET.hour(5).minute(0).second(0).millisecond(0);
                if (nowET.isBefore(todayCycleStartDateET)) {
                    todayCycleStartDateET = todayCycleStartDateET.subtract(1, 'day');
                }
                const todayCycleEndDateET = todayCycleStartDateET.add(1, 'day'); // 오늘 5AM ~ 다음날 5AM

                // 어제 데이터의 시작/종료 시간 정의 (오늘의 시작점을 기준으로 계산)
                const yesterdayCycleStartDateET = todayCycleStartDateET.subtract(1, 'day'); // 어제 5AM
                // const yesterdayCycleEndDateET = todayCycleStartDateET; // 어제 끝 = 오늘 시작 (쿼리용)

                const todayStartTimestamp = Timestamp.fromDate(todayCycleStartDateET.toDate());
                const todayEndTimestamp = Timestamp.fromDate(todayCycleEndDateET.toDate());
                const yesterdayStartTimestamp = Timestamp.fromDate(yesterdayCycleStartDateET.toDate());
                const yesterdayEndTimestamp = todayStartTimestamp; // 어제 데이터는 오늘 시작 전까지

                // --- X축 도메인 및 틱 설정 (어제 5AM ET ~ 다음날 5AM ET) ---
                const xAxisStartPointET = yesterdayCycleStartDateET; // 어제 5 AM ET
                const xAxisEndPointET = todayCycleEndDateET;         // 다음날 5 AM ET
                setXAxisDomain([xAxisStartPointET.valueOf(), xAxisEndPointET.valueOf()]);

                const ticks = [];
                let currentTickIter = xAxisStartPointET.clone();
                // xAxisEndPointET 까지 포함하여 틱 생성
                while (currentTickIter.isSameOrBefore(xAxisEndPointET)) {
                    // 매 3시간 정각 (00, 03, 06, 09, 12, 15, 18, 21시)
                    if (currentTickIter.minute() === 0 && currentTickIter.hour() % 3 === 0) {
                        ticks.push(currentTickIter.valueOf());
                    }
                    currentTickIter = currentTickIter.add(1, 'hour');
                }
                setXAxisTicks(ticks);

                console.log("Monitoring Trend: XAxis Domain:", xAxisStartPointET.format('MM/DD HH:mm Z'), 'to', xAxisEndPointET.format('MM/DD HH:mm Z'));
                console.log("Monitoring Trend: XAxis Ticks:", ticks.map(t => dayjs(t).tz(timeZone).format('MM/DD HH:mm')));


                console.log(`Monitoring Trend: Today Query [${todayStartTimestamp.toDate().toISOString()} UTC, ${todayEndTimestamp.toDate().toISOString()} UTC)`);
                console.log(`Monitoring Trend: Yesterday Query [${yesterdayStartTimestamp.toDate().toISOString()} UTC, ${yesterdayEndTimestamp.toDate().toISOString()} UTC)`);

                // --- 데이터 처리 함수 (xValue: 타임스탬프 사용) ---
                const processSnapshot = (snapshot) => {
                    const data = snapshot.docs.map(doc => {
                        const docData = doc.data();
                        const jsDate = docData.calculatedAt?.toDate();
                        if (!jsDate) return null;

                        const score = docData.focusScore !== null && docData.focusScore !== undefined
                                        ? Math.round(docData.focusScore * 100)
                                        : null;
                        // xValue: 밀리초 타임스탬프, value: 점수, timestamp: Date 객체 (정렬용)
                        return score !== null ? { xValue: jsDate.getTime(), value: score, timestamp: jsDate } : null;
                    }).filter(item => item !== null);
                    // 정렬은 타임스탬프 기준으로
                    data.sort((a, b) => a.timestamp - b.timestamp);
                    return data;
                };

                // --- Firestore 쿼리 (오늘 & 어제) ---
                const focusScoreCollectionRef = collection(db, `users/${userId}/FocusScore`);
                const todayQuery = query(focusScoreCollectionRef, where('calculatedAt', '>=', todayStartTimestamp), where('calculatedAt', '<', todayEndTimestamp), orderBy('calculatedAt', 'asc'));
                const yesterdayQuery = query(focusScoreCollectionRef, where('calculatedAt', '>=', yesterdayStartTimestamp), where('calculatedAt', '<', yesterdayEndTimestamp), orderBy('calculatedAt', 'asc'));

                const [todaySnapshot, yesterdaySnapshot] = await Promise.all([getDocs(todayQuery), getDocs(yesterdayQuery)]);
                const todayData = processSnapshot(todaySnapshot);
                const yesterdayData = processSnapshot(yesterdaySnapshot);

                console.log("Monitoring Trend: Fetched today data points:", todayData.length);
                console.log("Monitoring Trend: Fetched yesterday data points:", yesterdayData.length);
                setTrendData(todayData);
                setYesterdayTrendData(yesterdayData);

            } catch (error) {
                console.error("Monitoring Trend: Error fetching data: ", error);
                setErrorTrend("Failed to load focus score trend.");
                setTrendData([]);
                setYesterdayTrendData([]);
            } finally {
                setLoadingTrend(false);
            }
        };

        fetchTrendData();
    }, [currentUser, loadingAuth]);

    // renderMetric 수정: valueStyle prop 추가 및 우측 정렬 적용
    const renderMetric = (title, value, unit = '', valueStyle = {}) => (
        <div style={{ textAlign: 'left' }}> {/* 제목은 좌측 유지 */}
            <Space align="center" size="small">
                <Text style={{ fontSize: '14px', fontWeight: 500 }}>{title}</Text>
            </Space>
            {/* 값 부분: 우측 정렬 및 커스텀 스타일 적용 */}
            <Title level={4} style={{ margin: '4px 0 0 0', fontWeight: 600, textAlign: 'right', ...valueStyle }}>
                {loading ? <Spin size="small" /> : (value ?? 'N/A')}
                {!loading && value !== null && unit && <span style={{ fontSize: '16px', marginLeft: '4px', fontWeight: 500 }}>{unit}</span>}
            </Title>
        </div>
    );

    // X축 틱 포맷터 정의 (타임스탬프 -> HH:mm)
    const xAxisTickFormatter = (timestamp) => {
        return dayjs(timestamp).tz('America/New_York').format('HH:mm');
    };

    return (
        <Card title="Focus Metrics" style={{ marginBottom: 0 }}>
            {error && <Text type="danger" style={{ display: 'block', marginBottom: '16px' }}>{error}</Text>}
            {!error && (
                <Row gutter={[16, 10]}>
                    {/* 1행: Focus Score - 제목 옆에 값 표시, 상단 정렬 */}
                    <Col span={24}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            {/* 제목 */} 
                            <Space align="center" size="small" style={{ paddingTop: '4px' }}>
                                <Text style={{ fontSize: '14px', fontWeight: 500 }}>💯 Focus Score</Text>
                            </Space>
                            {/* 값 - 직접 Title 렌더링 */} 
                            <Title level={4} style={{ fontSize: '28px', margin: 0, fontWeight: 600 }}>
                                {loading ? <Spin size="small" /> : (monitoringData.focusScore !== null ? Math.round(monitoringData.focusScore * 100) : 'N/A')}
                                {!loading && monitoringData.focusScore !== null && <span style={{ fontSize: '16px', marginLeft: '4px', fontWeight: 500 }}>%</span>}
                            </Title>
                        </div>
                    </Col>

                    {/* 2행: Focus Score Trend */}
                    <Col span={24}>
                       <div style={{ textAlign: 'left' }}>
                            <Space align="center" size="small">
                                <Text style={{ fontSize: '14px', fontWeight: 500 }}>💯 Focus Score Trend</Text>
                                {/* 범례 (선택 사항) */}
                                <Space size={4} style={{ marginLeft: 8, fontSize: 12 }}>
                                    <span style={{ color: '#99DAFF' }}>■</span> Today
                                    <span style={{ color: '#cccccc', marginLeft: 4 }}>■</span> Yesterday
                                </Space>
                            </Space>
                             <div style={{ marginTop: '4px', height: '90px' }}>
                                {loadingTrend ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin /></div>
                                ) : errorTrend ? (
                                    <Text type="danger">{errorTrend}</Text>
                                // 데이터가 하나라도 있을 때 차트 표시 (최소 2포인트 조건은 각 라인에 개별 적용 어려움, 일단 표시)
                                ) : (trendData.length > 0 || yesterdayTrendData.length > 0) ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                            {/* XAxis 추가 및 설정 */}
                                            <XAxis
                                                dataKey="xValue" // 데이터 키를 타임스탬프로 변경
                                                type="number"    // 축 타입을 숫자로
                                                domain={xAxisDomain} // 계산된 도메인 설정
                                                ticks={xAxisTicks}  // 계산된 틱 설정
                                                tickFormatter={xAxisTickFormatter} // 포맷터 적용
                                                tick={{ fontSize: 10 }}
                                                axisLine={false} // 축 선 숨기기
                                                tickLine={false} // 틱 선 숨기기
                                                padding={{ left: 10, right: 10 }} // 좌우 패딩 추가
                                            />
                                            {/* YAxis는 제거된 상태 유지 */}
                                            {/* 툴팁 - shared={false} 추가 */}
                                            <RechartsTooltip content={<CustomTooltip />} shared={false} />
                                            {/* 오늘 데이터 라인 */}
                                            {trendData.length > 0 && (
                                                <RechartsLine
                                                    type="monotone"
                                                    dataKey="value"
                                                    data={trendData}
                                                    stroke="#99DAFF"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    connectNulls={false}
                                                    isAnimationActive={false}
                                                    name="Today"
                                                />
                                            )}
                                            {/* 어제 데이터 라인 */}
                                            {yesterdayTrendData.length > 0 && (
                                                <RechartsLine
                                                    type="monotone"
                                                    dataKey="value"
                                                    data={yesterdayTrendData}
                                                    stroke="#cccccc"
                                                    strokeWidth={2}
                                                    strokeDasharray="5 5"
                                                    dot={false}
                                                    connectNulls={false}
                                                    isAnimationActive={false}
                                                    name="Yesterday"
                                                />
                                            )}
                                        </LineChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <Text type="secondary">No trend data available for today or yesterday.</Text>
                                )}
                            </div>
                        </div>
                    </Col>

                    {/* Divider */}
                    <Col span={24}>
                         <Divider style={{ margin: '8px 0' }} />
                    </Col>

                    {/* 3행: Average Focus, Divider, Max Focus */}
                     <Col span={11}>
                        {renderMetric(
                            '⏰ Average Focus',
                            formatSeconds(monitoringData.averageFocus),
                            '',
                            { fontSize: '18px' }
                        )}
                    </Col>
                     {/* 세로 Divider 컬럼 - height: 100% 적용 */}
                     <Col span={1} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <Divider type="vertical" style={{ height: '100%' }} />
                     </Col>
                     <Col span={11}>
                         {renderMetric(
                            '⏰ Max Focus',
                             formatSeconds(monitoringData.maxFocus),
                             '',
                            { fontSize: '18px' }
                         )}
                    </Col>
                </Row>
            )}
             {/* Overall No Data Message */}
             {!loading && !loadingTrend && !error && !errorTrend && monitoringData.focusScore === null && monitoringData.averageFocus === null && monitoringData.maxFocus === null && trendData.length === 0 && (
                <Text type="secondary">No monitoring data available for today yet.</Text>
             )}
        </Card>
    );
}

export default Monitoring;