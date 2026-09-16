import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidSavedEdge, normalizeSavedEdge, normalizeSavedNodeCollection, normalizeSavedNodeMap } from './edgeUtils.js';

test('edge without handles is still valid when source and target exist', () => {
  const edge = { id: 'tank-a-plant-b', source: 'tank-a', target: 'plant-b' };
  assert.equal(isValidSavedEdge(edge), true);
  assert.deepEqual(normalizeSavedEdge(edge), {
    id: 'tank-a-plant-b',
    source: 'tank-a',
    target: 'plant-b',
    animated: false,
    type: 'straight',
    markerEnd: { type: 'arrowClosed', color: '#000' },
    style: { stroke: '#000', strokeWidth: 5, strokeLinecap: 'round' },
  });
});

test('edge with explicit handles keeps the exact attachment points', () => {
  const edge = {
    id: 'tank-a-shape-c',
    source: 'tank-a',
    target: 'shape-c',
    sourceHandle: 's-right',
    targetHandle: 't-top-left',
  };

  const normalized = normalizeSavedEdge(edge);
  assert.equal(isValidSavedEdge(edge), true);
  assert.equal(normalized.sourceHandle, 's-right');
  assert.equal(normalized.targetHandle, 't-top-left');
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

test('node state is normalized when stored as array or object map', () => {
  const arrayNodes = [
    { id: 'n1', x: 10, y: 20, label: 'Primero', customName: 'Primero' },
    { id: 'n2', x: 30, y: 40, label: 'Segundo', customName: 'Segundo' },
  ];

  const objectNodes = {
    n1: { id: 'n1', x: 10, y: 20, label: 'Primero', customName: 'Primero' },
    n2: { x: 30, y: 40, label: 'Segundo', customName: 'Segundo' },
  };

  assert.equal(normalizeSavedNodeCollection(arrayNodes).length, 2);
  assert.deepEqual(Object.keys(normalizeSavedNodeMap(objectNodes)), ['n1', 'n2']);
  assert.equal(normalizeSavedNodeMap(arrayNodes).n1.id, 'n1');
  assert.equal(normalizeSavedNodeMap(arrayNodes).n2.id, 'n2');
});
