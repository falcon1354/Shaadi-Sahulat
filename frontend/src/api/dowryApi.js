import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const dowryApi = {
  estimate: async (data) => {
    const r = await axios.post(`${API_BASE}/dowry/estimate`, data);
    return r.data;
  },

  save: async (data) => {
    const r = await axios.post(`${API_BASE}/dowry/save`, data);
    return r.data;
  },

  upsert: async (data) => {
    const r = await axios.post(`${API_BASE}/dowry/upsert`, data);
    return r.data;
  },

  getByUser: async (userId) => {
    const r = await axios.get(`${API_BASE}/dowry/by-user/${userId}`);
    return r.data;
  },

  getHistory: async (userId) => {
    const r = await axios.get(`${API_BASE}/dowry/history/${userId}`);
    return r.data;
  },

  getCategoryPrices: async () => {
    const r = await axios.get(`${API_BASE}/dowry/category-prices`);
    return r.data;
  },

  ruleOnlyEstimate: async (data) => {
    const r = await axios.post(`${API_BASE}/dowry/rule-only`, data);
    return r.data;
  },

  initML: async (numRecords = 150) => {
    const r = await axios.post(`${API_BASE}/dowry/ml/init`, { num_records: numRecords });
    return r.data;
  },

  getMLStats: async () => {
    const r = await axios.get(`${API_BASE}/dowry/ml/stats`);
    return r.data;
  },
};

export default dowryApi;
