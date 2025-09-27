const request = require('supertest');
const app = require('../server');

describe('API Tests', () => {
  test('GET /health should return OK status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
  });

  test('GET /api/users should return users array', async () => {
    const response = await request(app).get('/api/users');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('POST /api/users should create new user', async () => {
    const newUser = { name: 'Test User', email: 'test@example.com' };
    const response = await request(app)
      .post('/api/users')
      .send(newUser);
    expect(response.status).toBe(201);
    expect(response.body.name).toBe(newUser.name);
  });
});
