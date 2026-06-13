import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = {
  /**
   * Preview dowry estimation (no save)
   */
  estimate: async (data) => {
    const response = await axios.post(`${API_BASE}/dowry/estimate`, data);
    return response.data;
  },

  /**
   * Save estimation to DB and ML dataset
   */
  save: async (data) => {
    const response = await axios.post(`${API_BASE}/dowry/save`, data);
    return response.data;
  },

  /**
   * Get estimation history for a user
   */
  getHistory: async (userId) => {
    const response = await axios.get(`${API_BASE}/dowry/history/${userId}`);
    return response.data;
  },

  /**
   * Rule-only estimation (no ML)
   */
  ruleOnlyEstimate: async (data) => {
    const response = await axios.post(`${API_BASE}/dowry/rule-only`, data);
    return response.data;
  },

  /**
   * Initialize ML service
   */
  initML: async (numRecords = 150) => {
    const response = await axios.post(`${API_BASE}/dowry/ml/init`, { num_records: numRecords });
    return response.data;
  },

  /**
   * Get ML stats
   */
  getMLStats: async () => {
    const response = await axios.get(`${API_BASE}/dowry/ml/stats`);
    return response.data;
  },
};

export default api;
