/**
 * Integration tests for boox-reader-backend
 * Uses real MongoDB (localhost) and real JWT tokens signed with SUPABASE_JWT_SECRET
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Must set env vars before requiring the app
process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-secret-for-ci';
process.env.MONGODB_URI = 'mongodb://localhost:27017/boox-reader-test';
process.env.PORT = '5001';

const app = require('./server');

// Generate a valid Supabase-style JWT for a test user
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const validToken = jwt.sign(
  { sub: TEST_USER_ID, email: 'test@test.com', role: 'authenticated' },
  process.env.SUPABASE_JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '1h' }
);
const authHeader = `Bearer ${validToken}`;

afterAll(async () => {
  // Clean up test database and close connection
  await mongoose.connection.db?.dropDatabase();
  await mongoose.connection.close();
});

// ============ Health & Static ============

describe('GET /', () => {
  it('returns health status JSON', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('boox-reader-backend');
  });
});

describe('GET /favicon.ico', () => {
  it('returns 204 No Content', async () => {
    const res = await request(app).get('/favicon.ico');
    expect(res.status).toBe(204);
  });
});

// ============ Auth Guard ============

describe('Auth guard', () => {
  it('rejects request with no token', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no token/i);
  });

  it('rejects request with malformed token', async () => {
    const res = await request(app)
      .get('/api/books')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid token/i);
  });

  it('rejects token without sub claim', async () => {
    const noSubToken = jwt.sign(
      { email: 'test@test.com' }, // missing sub
      process.env.SUPABASE_JWT_SECRET,
      { algorithm: 'HS256' }
    );
    const res = await request(app)
      .get('/api/books')
      .set('Authorization', `Bearer ${noSubToken}`);
    expect(res.status).toBe(401);
  });
});

// ============ GET /api/books ============

describe('GET /api/books', () => {
  it('returns empty array for new user', async () => {
    const res = await request(app)
      .get('/api/books')
      .set('Authorization', authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ============ GET /api/books/:bookId ============

describe('GET /api/books/:bookId', () => {
  it('returns 404 for non-existent book', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/api/books/${fakeId}`)
      .set('Authorization', authHeader);
    expect(res.status).toBe(404);
  });

  it('returns 401 without token', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/books/${fakeId}`);
    expect(res.status).toBe(401);
  });
});

// ============ PATCH /api/books/:bookId/progress ============

describe('PATCH /api/books/:bookId/progress', () => {
  it('returns 401 without token', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .patch(`/api/books/${fakeId}/progress`)
      .send({ page: 5 });
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent book', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .patch(`/api/books/${fakeId}/progress`)
      .set('Authorization', authHeader)
      .send({ page: 5 });
    expect(res.status).toBe(404);
  });
});

// ============ DELETE /api/books/:bookId ============

describe('DELETE /api/books/:bookId', () => {
  it('returns 401 without token', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).delete(`/api/books/${fakeId}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for non-existent book', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .delete(`/api/books/${fakeId}`)
      .set('Authorization', authHeader);
    expect(res.status).toBe(404);
  });
});

// ============ POST /api/books/upload-url ============

describe('POST /api/books/upload-url', () => {
  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/books/upload-url')
      .send({ url: 'http://example.com/test.pdf' });
    expect(res.status).toBe(401);
  });

  it('returns error for missing URL body', async () => {
    const res = await request(app)
      .post('/api/books/upload-url')
      .set('Authorization', authHeader)
      .send({});
    // Should fail (missing url → axios will throw)
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns error for unreachable MD URL (auth guard passes)', async () => {
    const res = await request(app)
      .post('/api/books/upload-url')
      .set('Authorization', authHeader)
      .send({ url: 'http://localhost:9999/nonexistent.md', title: 'Test MD' });
    // Auth passes, but download will fail → 400
    expect(res.status).toBe(400);
  });
});
