/**
 * ML Client for ShaadiSahulat Dowry Estimation
 * ===============================================
 * Communicates with the Python Flask ML microservice.
 * Can be imported independently by other modules.
 */

const axios = require("axios");

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL || "http://localhost:5001";

/**
 * Get the ML adjustment factor for a user.
 *
 * @param {Object} params
 * @param {number} params.income - Monthly household income
 * @param {number} params.savings - Total savings
 * @param {number} params.unmarried_children - Number of unmarried children
 * @param {number} params.youngest_age - Age of youngest unmarried child
 * @returns {Promise<{adjustment_factor: number, cluster_id: number, similar_users_count: number}>}
 */
async function getAdjustmentFactor({ income, savings, unmarried_children, youngest_age }) {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/ml/dowry-adjustment`,
      {
        income,
        savings,
        unmarried_children,
        youngest_age,
      },
      { timeout: 10000 }
    );

    if (response.data && response.data.success) {
      return {
        adjustment_factor: response.data.adjustment_factor || 0,
        cluster_id: response.data.cluster_id || 0,
        similar_users_count: response.data.similar_users_count || 0,
        cluster_mean_deviation: response.data.cluster_mean_deviation || 0,
      };
    }

    console.warn("[mlClient] ML service returned unsuccessful response:", response.data);
    return { adjustment_factor: 0, cluster_id: -1, similar_users_count: 0, cluster_mean_deviation: 0 };
  } catch (error) {
    console.warn("[mlClient] ML service unavailable, using fallback (0 adjustment):", error.message);
    return { adjustment_factor: 0, cluster_id: -1, similar_users_count: 0, cluster_mean_deviation: 0 };
  }
}

/**
 * Add a new user's data to the ML dataset (after dowry estimation completion).
 * Also triggers model retraining.
 *
 * @param {Object} userData - Full user estimation data
 * @returns {Promise<{success: boolean, new_user_id: string}>}
 */
async function addUserToDataset(userData) {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/ml/add-user`,
      userData,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    console.warn("[mlClient] Failed to add user to dataset:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize the ML service (generate dataset + train model).
 *
 * @param {number} numRecords - Number of synthetic records to generate
 * @returns {Promise<Object>}
 */
async function initMLService(numRecords = 150) {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/ml/init`,
      { num_records: numRecords },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    console.warn("[mlClient] Failed to initialize ML service:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get dataset statistics from the ML service.
 *
 * @returns {Promise<Object>}
 */
async function getDatasetStats() {
  try {
    const response = await axios.get(
      `${ML_SERVICE_URL}/ml/dataset-stats`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.warn("[mlClient] Failed to get dataset stats:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Trigger model retraining (e.g., after adding new users).
 *
 * @returns {Promise<Object>}
 */
async function retrainModel() {
  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/ml/retrain`,
      {},
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    console.warn("[mlClient] Failed to retrain model:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getAdjustmentFactor,
  addUserToDataset,
  initMLService,
  getDatasetStats,
  retrainModel,
};
