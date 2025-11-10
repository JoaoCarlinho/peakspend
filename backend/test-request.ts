import request from 'supertest';
import app from './src/app';

console.log('request:', typeof request);
console.log('app:', typeof app);

const test = request(app);
console.log('request(app):', typeof test);
console.log('request(app).get:', typeof test.get);
console.log('request(app).set:', typeof test.set);
