import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/config'; // Firebase 설정에서 auth 가져오기

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(undefined); // Start as undefined = loading
  const [authError, setAuthError] = useState(null);
  const [initAuthAttempted, setInitAuthAttempted] = useState(false); // 익명 로그인 시도 여부 추적

  useEffect(() => {
    console.log("AuthProvider: Setting up onAuthStateChanged listener...");

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("AuthProvider: onAuthStateChanged fired.", user ? `User UID: ${user.uid}` : "No user detected by listener.");

      if (user) {
        // 사용자가 있으면 상태 업데이트 (로그인 성공 또는 기존 세션 로드)
        setCurrentUser(user);
        setAuthError(null);
      } else {
        // 사용자가 없으면
        if (!initAuthAttempted) {
          // 아직 초기 익명 로그인 시도를 안했으면 시도
          setInitAuthAttempted(true); // 시도했다고 표시
          console.log("AuthProvider: Initial check found no user. Attempting anonymous sign-in...");
          try {
            await signInAnonymously(auth);
            console.log("AuthProvider: Anonymous sign-in requested. Listener will update state.");
            // 성공하면 리스너가 다시 user와 함께 호출될 것임
            // 실패해도 리스너가 다시 null과 함께 호출될 수 있음 (또는 에러 발생)
          } catch (error) {
            console.error("AuthProvider: Error signing in anonymously:", error);
            setAuthError(error);
            setCurrentUser(null); // 에러 발생 시 최종 상태 null로 확정
          }
        } else {
          // 이미 익명 로그인을 시도했음에도 user가 null이면 최종적으로 사용자 없음
          console.log("AuthProvider: Anonymous sign-in attempted, but listener still reports no user.");
          setCurrentUser(null);
        }
      }
    });

    return () => {
      console.log("AuthProvider: Cleaning up listener.");
      unsubscribe();
    };
  // initAuthAttempted 상태 변경 시 리스너 재설정 방지 위해 의존성 배열 비움
  }, []);

  const value = {
    currentUser,
    authError,
    loadingAuth: currentUser === undefined, // 로딩 상태는 currentUser가 확정될 때까지
  };

  // Render children only when the auth state is determined (not undefined)
  return (
    <AuthContext.Provider value={value}>
      {currentUser !== undefined && children}
    </AuthContext.Provider>
  );
} 