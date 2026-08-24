import axios from 'axios';
const API_URL = process.env.VITE_API_URL || 'http://127.0.0.1:8001/api';
(async () => {
  try {
    const url = `${API_URL.replace(/\/+$/, '')}/tanques`;
    const resp = await axios.get(url);
    const data = resp?.data?.tanques ?? resp?.data ?? [];
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error fetching API:', err.message || err);
    process.exit(2);
  }
})();
