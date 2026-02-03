/**
 * Auth API - MedeePay Pattern
 * Authentication endpoints (no institution prefix)
 */

import apiClient from './client';

/**
 * Auth API for authentication operations
 * These don't use institution prefix - auth is global
 */
export const authApi = {
  // Staff login
  login: (credentials) => 
    apiClient.post('/auth/login', credentials),
  
  // Student login
  studentLogin: (credentials) => 
    apiClient.post('/auth/student-login', credentials),
  
  // Password recovery
  forgotPassword: (email) => 
    apiClient.post('/auth/forgot-password', { email }),
  
  resetPassword: (data) => 
    apiClient.post('/auth/reset-password', data),
  
  verifyToken: (token) => 
    apiClient.post('/auth/verify-token', { token }),
  
  // SSO for cross-subdomain navigation
  generateSsoToken: () => 
    apiClient.post('/auth/sso/generate'),
  
  exchangeSsoToken: (ssoToken) => 
    apiClient.post('/auth/sso/exchange', { sso_token: ssoToken }),
  
  // Protected routes
  getProfile: () => 
    apiClient.get('/auth/me'),
  
  updateProfile: (data) => 
    apiClient.put('/auth/profile', data),
  
  changePassword: (data) => 
    apiClient.put('/auth/password', data),
  
  logout: () => 
    apiClient.post('/auth/logout'),
  
  refreshToken: () => 
    apiClient.post('/auth/refresh-token'),
};

export default authApi;
