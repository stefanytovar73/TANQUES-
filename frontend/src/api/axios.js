import axios from "axios";

const getApiBaseUrl = () => {
  const configured = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return "/api";
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error && error.config ? error.config : null;
    if (!originalRequest) return Promise.reject(error);

    const retryCount = Number(originalRequest.__retryCount || 0);
    const canRetry = !error.response || error.response.status === 502 || error.response.status === 503 || error.response.status === 504 || error.code === "ERR_NETWORK" || error.code === "ECONNABORTED";

    if (!canRetry || retryCount >= 5) {
      return Promise.reject(error);
    }

    originalRequest.__retryCount = retryCount + 1;
    const delayMs = 400 * originalRequest.__retryCount;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return api(originalRequest);
  }
);

export default api;