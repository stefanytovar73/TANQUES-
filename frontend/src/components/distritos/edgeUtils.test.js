import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSavedEdge, normalizeSavedEdge } from './edgeUtils.js';

test('edge without handles is still valid when source and target exist', () => {
  const edge = { id: 'tank-a-plant-b', source: 'tank-a', target: 'plant-b' };
  assert.equal(isValidSavedEdge(edge), true);
  assert.deepEqual(normalizeSavedEdge(edge), {
    id: 'tank-a-plant-b',
    source: 'tank-a',
    target: 'plant-b',
    animated: false,
    type: 'step',
    markerEnd: { type: 'arrowClosed', color: '#000' },
    style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
  });
});

test('edge with undefined handle strings is cleaned without dropping the edge', () => {
  const edge = {
    id: 'tank-a-shape-c',
    source: 'tank-a',
    target: 'shape-c',
    sourceHandle: 'undefined',
    targetHandle: 'undefined',
  };

  const normalized = normalizeSavedEdge(edge);
  assert.equal(isValidSavedEdge(edge), true);
  assert.ok(!('sourceHandle' in normalized));
  assert.ok(!('targetHandle' in normalized));
});
