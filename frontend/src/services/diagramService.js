import api from '../api/axios';

const diagramService = {
  getState: async () => {
    try {
      const res = await api.get('/diagram/state');
      return res.data || {};
    } catch (e) {
      return {};
    }
  },
  saveState: async (state) => {
    try {
      await api.post('/diagram/state', state || {});
      return true;
    } catch (e) {
      throw e;
    }
  }
};

export default diagramService;
