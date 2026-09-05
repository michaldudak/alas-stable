export const STABLE = { x: -38, z: -1, halfWidth: 12, halfDepth: 13, aisleHalfWidth: 3.7 };
// Rendered walls and physical barriers share these dimensions.
export const STABLE_WALLS = [
  { x: -12, z: 0, w: .4, d: 26, h: 6 }, { x: 12, z: 0, w: .4, d: 26, h: 6 },
  ...[-13,13].flatMap(z => [-1,1].map(side => ({ x: side * 7.9, z, w: 8.2, d: .4, h: 6 }))),
  ...[-1,1].flatMap(side => [-5,3].map(z => ({x:side*7.85,z,w:8.3,d:.22,h:3.8}))),
  ...[-9,-1,7].map(z => ({x:-3.7,z,w:.2,d:8,h:1.8,stall:true})),
  ...[-9,-1].map(z => ({x:3.7,z,w:.2,d:8,h:1.8,stall:true})),
  {x:-7.85,z:11,w:8.3,d:.22,h:3.8},
  // Tack-room entrance is 4.8 units wide, opening directly onto the aisle.
  {x:3.7,z:3.75,w:.2,d:1.5,h:4.6}, {x:3.7,z:11.75,w:.2,d:2.5,h:4.6},
];
export function stableSolids() {
  return STABLE_WALLS.map(w => ({x:w.x+STABLE.x,z:w.z+STABLE.z,w:w.w,d:w.d}));
}
export function insideStable(x,z,margin=0) {
  return Math.abs(x-STABLE.x)<STABLE.halfWidth+margin && Math.abs(z-STABLE.z)<STABLE.halfDepth+margin;
}
export function inTackRoom(x,z) { return insideStable(x,z) && x>STABLE.x+3.7 && z>STABLE.z+3; }
