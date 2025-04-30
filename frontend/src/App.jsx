import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import TrendPage from './pages/TrendPage';
import GalleryPage from './pages/GalleryPage';
import HistoryPage from './pages/HistoryPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="trend" element={<TrendPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="history" element={<HistoryPage />} />
      </Route>
    </Routes>
  );
}

export default App;
