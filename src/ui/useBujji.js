// src/ui/useBujji.js
import axios from 'axios';

export async function callBujjiAction(action, data) {
  return axios.post('/api/bujji/proxy', { action, data }); // proxy via your server
}
