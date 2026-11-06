import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createGarment} from '../scripts/garment-model.mjs';

const designs=JSON.parse(fs.readFileSync('apps/web/content/collection-designs.json','utf8'));
function release(group){group.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});}

test('hood has a broad open face with recessed lining, no fabric strip across it',()=>{
  for(const collar of ['hood','double-hood']){
    const spec={...designs.find(d=>d.kind==='hoodie'),geometry:{...designs.find(d=>d.kind==='hoodie').geometry,collar}};
    const group=createGarment(spec);group.updateMatrixWorld(true);
    for(const x of [-.16,-.08,0,.08,.16])for(const y of [.94,1.04,1.10]){
      const ray=new THREE.Raycaster(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1));
      const hits=ray.intersectObject(group,true);
      assert.equal(hits[0]?.object.name,'Hood interior lining',`${collar}: blocked face at ${x}/${y}`);
      assert(hits[0].point.z<.06,'Lining must be recessed behind the opening');
    }
    release(group);
  }
});

test('all garment specs have finite geometry and sleeve roots below the shoulder',()=>{
  for(const spec of designs){
    const group=createGarment(spec);group.updateMatrixWorld(true);
    const torso=group.children.filter(mesh=>['Sewn torso','Rounded shoulder yoke'].includes(mesh.name));
    group.traverse(mesh=>{
      if(!mesh.isMesh)return;
      for(const name of ['position','normal'])assert([...mesh.geometry.getAttribute(name).array].every(Number.isFinite),`${spec.slug}/${mesh.name}/${name}`);
      if(/^(Right|Left) sleeve$/.test(mesh.name)){
        const position=mesh.geometry.getAttribute('position');
        for(const i of [0,12,24,36,48]){
          const vertex=new THREE.Vector3().fromBufferAttribute(position,i);
          const hits=new THREE.Raycaster(new THREE.Vector3(vertex.x,2,vertex.z),new THREE.Vector3(0,-1,0)).intersectObjects(torso);
          assert(hits[0]&&hits[0].point.y>=vertex.y,`${spec.slug}: sleeve root exposed above shoulder`);
        }
      }
    });
    release(group);
  }
});
