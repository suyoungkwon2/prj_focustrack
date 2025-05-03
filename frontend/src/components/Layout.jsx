import React, { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Input, Tooltip } from 'antd';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

const { Header, Content } = AntLayout;

// 네비게이션 메뉴 아이템 정의
const items = [
  { key: '/', label: <Link to="/">Today</Link> },
  { key: '/trend', label: <Link to="/trend">Trend</Link> },
  { key: '/gallery', label: <Link to="/gallery">Gallery</Link> },
  { key: '/history', label: <Link to="/history">History</Link> },
  // { key: '/settings', label: <Link to="/settings">Settings</Link> }, // 추후 추가
];

function Layout() {
  const location = useLocation();
  const { currentUser } = useAuth();
  const [nickname, setNickname] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [loadingNickname, setLoadingNickname] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const fetchNickname = async () => {
      if (currentUser) {
        setLoadingNickname(true);
        try {
          const userDocRef = doc(db, 'users_list', currentUser.uid);
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists() && docSnap.data().nickName) {
            setNickname(docSnap.data().nickName);
            setEditNickname(docSnap.data().nickName);
            setIsEditing(false);
          } else {
            setNickname('');
            setEditNickname('');
            setIsEditing(true);
          }
        } catch (error) {
          console.error("Error fetching nickname:", error);
          setNickname('');
        } finally {
          setLoadingNickname(false);
        }
      }
    };
    fetchNickname();
  }, [currentUser]);

  const selectedKeys = [location.pathname];

  const handleSaveNickname = async () => {
    if (!currentUser || !editNickname || !editNickname.trim()) {
      if(nickname) setIsEditing(false);
      return;
    }
    const newNickname = editNickname.trim();
    if (newNickname === nickname) {
      setIsEditing(false);
      return;
    }

    try {
      const userDocRef = doc(db, 'users_list', currentUser.uid);
      await setDoc(userDocRef, { nickName: newNickname }, { merge: true });
      setNickname(newNickname);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving nickname:", error);
    }
  };

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', borderBottom: '1px solid #f0f0f0', padding: '0 50px' }}>
        {/* 로고 Placeholder -> Link로 감싸기 */}
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="logo" style={{ color: '#1890ff', marginRight: '24px', fontWeight: 'bold', fontSize: '18px' }}>FocusTrack</div>
        </Link>
        <Menu
          theme="light"
          mode="horizontal"
          selectedKeys={selectedKeys}
          items={items}
          style={{ flex: 1, borderBottom: 'none' }}
        />
         {/* 사용자 프로필 */}
         <div style={{ marginLeft: 'auto' }}>
           {currentUser && !loadingNickname && (
             isEditing ? (
               <Input
                 placeholder="✍️ Enter your nickname! 😝 "
                 value={editNickname}
                 onChange={(e) => setEditNickname(e.target.value)}
                 onPressEnter={handleSaveNickname}
                 onBlur={handleSaveNickname}
                 style={{ width: '200px' }}
                 autoFocus
               />
             ) : (
               <Tooltip title="Click to edit nickname">
                 <span onClick={() => setIsEditing(true)} style={{ cursor: 'pointer' }}>
                   {nickname || 'Set Nickname'}
                 </span>
               </Tooltip>
             )
           )}
           {loadingNickname && <span style={{ color: '#ccc' }}>Loading...</span>}
           {!currentUser && <span style={{ color: '#ccc' }}>Not logged in</span>}
         </div>
      </Header>
      <Content style={{ padding: '24px 50px', maxWidth: 'none' }}>
         {/* 중첩된 라우트의 컴포넌트가 여기에 렌더링됨 */}
        <Outlet />
      </Content>
    </AntLayout>
  );
}

export default Layout; 