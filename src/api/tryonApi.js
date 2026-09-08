import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Size-Aware Virtual Try-On API
 */
const tryonApi = {
  preview: async ({
    personFile,
    productId,
    productSize,
    buyerSize,
    heightCm,
    chestCm,
    waistCm,
    hipCm,
    category,
  }) => {
    const form = new FormData();
    form.append('person', personFile);
    if (productId) form.append('product_id', productId);
    if (productSize) form.append('product_size', productSize);
    if (buyerSize) form.append('buyer_size', buyerSize);
    if (heightCm) form.append('height_cm', String(heightCm));
    if (chestCm) form.append('chest_cm', String(chestCm));
    if (waistCm) form.append('waist_cm', String(waistCm));
    if (hipCm) form.append('hip_cm', String(hipCm));
    if (category) form.append('category', category);

    const res = await axios.post(`${API_BASE}/visual/tryon`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 210000, // Kling async try-on can take up to ~3 minutes
    });
    return res.data;
  },

  fitOnly: async (payload) => {
    const res = await axios.post(`${API_BASE}/visual/tryon/fit`, payload, {
      timeout: 15000,
    });
    return res.data;
  },

  health: async () => {
    const res = await axios.get(`${API_BASE}/visual/tryon/health`, { timeout: 8000 });
    return res.data;
  },
};

export default tryonApi;
