const edges=[{id:'e1',type:'straight'},{id:'e2',type:'default'},{id:'e3',type:'smoothstep'},{id:'e4',type:'step'}];
console.log('Inicial:', edges.map(e=>e.id+"="+e.type).join(', '));
const updateEdgeType=(arr,edgeId,type)=>arr.map(e=>e.id===edgeId?({...e,type}):e);
const setDefaultEdgeType=(arr,type)=>arr; // no-op for existing edges
let after1=updateEdgeType(edges,'e2','step');
console.log('Tras cambiar e2->step:', after1.map(e=>e.id+"="+e.type).join(', '));
let after2=updateEdgeType(after1,'e4','default');
console.log('Tras cambiar e4->default:', after2.map(e=>e.id+"="+e.type).join(', '));
