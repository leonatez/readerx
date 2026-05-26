import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from '@/pages/auth-page';
import LibraryPage from '@/pages/library-page';
import ReaderPage from '@/pages/reader-page';
import ProtectedRoute from '@/components/protected-route';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/read/:bookId" element={<ReaderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
