import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const visualApi = {
  /**
   * Upload an image and get similar dress recommendations
   */
  recommend: async (imageFile, preferredCategory = null, limit = 10, userId = 'anonymous', description = '') => {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (preferredCategory) {
      formData.append('preferred_category', preferredCategory);
    }
    if (description) {
      formData.append('description', description);
    }
    formData.append('limit', String(limit));
    formData.append('user_id', userId);

    const response = await axios.post(`${API_BASE}/visual/recommend`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 35000,
    });
    return response.data;
  },

  /**
   * Get supported dress categories
   */
  getCategories: async () => {
    const response = await axios.get(`${API_BASE}/visual/categories`);
    return response.data;
  },

  /**
   * Check ML service health
   */
  getMLHealth: async () => {
    const response = await axios.get(`${API_BASE}/visual/ml-health`);
    return response.data;
  },

  /**
   * Get dataset status (image counts per category)
   */
  getDatasetStatus: async () => {
    const response = await axios.get(`${API_BASE}/visual/dataset-status`);
    return response.data;
  },

  /**
   * Get embedding index statistics
   */
  getIndexStats: async () => {
    const response = await axios.get(`${API_BASE}/visual/index-stats`);
    return response.data;
  },

  /**
   * Get recommendation history for a user
   */
  getHistory: async (userId, limit = 20) => {
    const response = await axios.get(`${API_BASE}/visual/history/${userId}?limit=${limit}`);
    return response.data;
  },

  /**
   * Seed demo products into MongoDB
   */
  seedDemo: async () => {
    const response = await axios.post(`${API_BASE}/visual/seed-demo`);
    return response.data;
  },
};

export default visualApi;
