import { useState, useCallback } from 'react';
import api from '@/lib/api-client';

export function useBooks() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/books');
      setBooks(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load books');
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadBook = async (url, title) => {
    const { data } = await api.post('/api/books/upload-url', { url, title });
    return data;
  };

  const deleteBook = async (bookId) => {
    await api.delete(`/api/books/${bookId}`);
    setBooks((prev) => prev.filter((b) => b._id !== bookId));
  };

  const updateProgress = async (bookId, page) => {
    await api.patch(`/api/books/${bookId}/progress`, { page });
  };

  const getBook = async (bookId) => {
    const { data } = await api.get(`/api/books/${bookId}`);
    return data;
  };

  return { books, loading, error, fetchBooks, uploadBook, deleteBook, updateProgress, getBook };
}
