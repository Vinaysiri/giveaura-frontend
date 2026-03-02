// src/bujji/client.js
const axios = require('axios');

const api = axios.create({
  baseURL: process.env.BUJJI_API_BASE,
  timeout: 10000,
  headers: { 'Authorization': `Bearer ${process.env.BUJJI_API_KEY}` }
});

async function triggerAction(actionName, payload) {
  const res = await api.post(`/actions/${actionName}`, payload);
  return res.data;
}

async function getStatus(resourceId) {
  const res = await api.get(`/status/${resourceId}`);
  return res.data;
}

module.exports = { triggerAction, getStatus };
