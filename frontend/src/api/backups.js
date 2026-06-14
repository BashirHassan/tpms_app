import apiClient from './client';

const backupsApi = {
  getAll: () => apiClient.get('/global/backups'),
  download: (filename) =>
    apiClient.get(`/global/backups/${filename}`, { responseType: 'blob' }),
};

export default backupsApi;
