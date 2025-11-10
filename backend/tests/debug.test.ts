import request from 'supertest';
import app from '../src/app';

describe('Debug Test', () => {
  it('should verify imports', () => {
    console.log('request type:', typeof request);
    console.log('app type:', typeof app);

    const agent = request(app);
    console.log('request(app) type:', typeof agent);
    console.log('agent.set type:', typeof agent.set);

    const testRequest = agent.get('/health');
    console.log('agent.get("/health") type:', typeof testRequest);
    console.log('testRequest.set type:', typeof testRequest.set);
  });
});
