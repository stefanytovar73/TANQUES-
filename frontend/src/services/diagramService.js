import api from '../api/axios';

const diagramService = {
  getState: async () => {
    const res = await api.get('diagram/state');
    return res.data || {};
  },

  saveState: async (state) => {
    const payload = (state && typeof state === 'object')
      ? JSON.parse(JSON.stringify(state))
      : null;

    if (!payload || typeof payload !== 'object') {
      return false;
    }

    const hasNodesKey = Object.prototype.hasOwnProperty.call(payload, 'nodes');
    const hasEdgesKey = Object.prototype.hasOwnProperty.call(payload, 'edges');
    const hasOtherKey = Object.keys(payload).some((key) => key !== 'nodes' && key !== 'edges');

    if (!hasNodesKey && !hasEdgesKey && !hasOtherKey) {
      return false;
    }

    await api.post('diagram/state', payload);
    return true;
  },
};

export default diagramService;
